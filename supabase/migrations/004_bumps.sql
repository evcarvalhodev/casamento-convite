-- Orderbumps com cadeado (mesma estrutura do ViralFlow: soundflow_access / premiumpack_access).
-- Aqui o acesso mora em convites.recursos = {"padrinhos": bool, "pix": bool}.

-- Respostas dos padrinhos entram na mesma tabela das confirmações.
alter table public.confirmacoes add column if not exists tipo text not null default 'convidado';
do $$ begin
  alter table public.confirmacoes add constraint confirmacoes_tipo_ck check (tipo in ('convidado', 'padrinho', 'madrinha'));
exception when duplicate_object then null; end $$;

drop function if exists public.confirmar_presenca(text, text, boolean, int, text);
create or replace function public.confirmar_presenca(p_slug text, p_nome text, p_vai boolean, p_pessoas int, p_recado text, p_tipo text default 'convidado')
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rec jsonb;
begin
  select id, recursos into v_id, v_rec from public.convites
   where slug = lower(p_slug) and publicado and (expira_em is null or expira_em >= current_date);
  if v_id is null then raise exception 'convite não encontrado'; end if;
  if p_tipo not in ('convidado', 'padrinho', 'madrinha') then raise exception 'tipo inválido'; end if;
  -- resposta de padrinho só existe se o casal comprou o bump
  if p_tipo <> 'convidado' and coalesce((v_rec->>'padrinhos')::boolean, false) = false then raise exception 'recurso não liberado'; end if;
  insert into public.confirmacoes (convite_id, nome, vai, pessoas, recado, tipo)
  values (v_id, left(trim(p_nome), 80), p_vai,
          case when p_vai then greatest(1, least(coalesce(p_pessoas, 1), 10)) else 0 end,
          left(nullif(trim(p_recado), ''), 400), p_tipo);
end $$;
grant execute on function public.confirmar_presenca(text, text, boolean, int, text, text) to anon, authenticated;

-- ativar_compras agora entende compra SÓ do bump (itens.base = false):
-- em vez de criar convite novo, soma o recurso no convite que a pessoa já tem.
create or replace function public.ativar_compras()
returns int language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_n int := 0;
  v_conv uuid;
  r record;
begin
  if v_uid is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  for r in
    select id, itens from public.pedidos
    where lower(email) = v_email and status = 'aprovado' and user_id is null
    order by criado_em
  loop
    update public.pedidos set user_id = v_uid where id = r.id;
    if coalesce((r.itens->>'base')::boolean, true) then
      insert into public.convites (user_id, pedido_id, recursos)
      values (v_uid, r.id, jsonb_build_object(
        'padrinhos', coalesce((r.itens->>'padrinhos')::boolean, false),
        'pix',       coalesce((r.itens->>'pix')::boolean, false)))
      on conflict (pedido_id) do nothing;
    else
      select id into v_conv from public.convites where user_id = v_uid order by criado_em desc limit 1;
      if v_conv is not null then
        update public.convites set recursos = recursos
          || case when coalesce((r.itens->>'padrinhos')::boolean, false) then '{"padrinhos": true}'::jsonb else '{}'::jsonb end
          || case when coalesce((r.itens->>'pix')::boolean, false) then '{"pix": true}'::jsonb else '{}'::jsonb end
        where id = v_conv;
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.ativar_compras() from public, anon;
grant execute on function public.ativar_compras() to authenticated;

-- A trava que impede o casal de se dar recurso checava o LOGIN (jwt), e aí travava
-- também o ativar_compras (que roda como dono do banco, mas com o login do casal).
-- Agora checa o papel que está de fato executando: só o update direto do casal é travado.
create or replace function public.proteger_convite()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.recursos := old.recursos;
    new.user_id  := old.user_id;
    new.pedido_id := old.pedido_id;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
