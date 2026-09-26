-- Pode Abrir — banco inteiro.
-- Rodar UMA vez no SQL Editor do projeto novo do Supabase.
-- Pode rodar de novo sem quebrar (tudo é "if not exists" / "or replace").

create extension if not exists pgcrypto;

-- ============================================================
-- PEDIDOS — uma linha por tentativa de compra
-- ============================================================
create table if not exists public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  nome               text not null default '',
  email              text not null,
  whatsapp           text,
  cpf                text,

  -- o que foi comprado: {"base":true,"padrinhos":true,"pix":false}
  itens              jsonb not null,
  valor              numeric(10,2) not null,

  metodo             text,                 -- pix | credit_card | debit_card | cortesia
  mp_payment_id      text unique,
  status             text not null default 'pendente',  -- pendente | aprovado | recusado | estornado
  status_detalhe     text,

  user_id            uuid references auth.users(id) on delete set null,
  acesso_enviado_em  timestamptz            -- trava de idempotência do e-mail de acesso
);
create index if not exists pedidos_status_idx on public.pedidos (status, criado_em desc);
create index if not exists pedidos_email_idx  on public.pedidos (lower(email));
alter table public.pedidos enable row level security;
-- Sem policy: só as Edge Functions (service_role) leem e escrevem.

-- ============================================================
-- CONVITES — um por pedido aprovado
-- ============================================================
create table if not exists public.convites (
  id             uuid primary key default gen_random_uuid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  user_id        uuid not null references auth.users(id) on delete cascade,
  pedido_id      uuid unique references public.pedidos(id) on delete set null,

  slug           text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  modelo         text not null default 'classico',
  dados          jsonb not null default '{}'::jsonb,   -- tudo que o convite.html precisa
  publicado      boolean not null default false,
  data_evento    date,
  -- recursos comprados nos orderbumps: {"padrinhos":true,"pix":true}
  recursos       jsonb not null default '{}'::jsonb,
  -- some do ar e é apagado 60 dias depois do casamento
  expira_em      date generated always as (data_evento + 60) stored
);
create index if not exists convites_user_idx on public.convites (user_id);
alter table public.convites enable row level security;

drop policy if exists "dono lê o próprio convite" on public.convites;
create policy "dono lê o próprio convite" on public.convites
  for select using (auth.uid() = user_id);

drop policy if exists "dono edita o próprio convite" on public.convites;
create policy "dono edita o próprio convite" on public.convites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Insert e delete: só pelas Edge Functions. O casal não cria convite sem pagar.

-- O casal não pode se dar recurso que não comprou, nem trocar de dono.
create or replace function public.proteger_convite()
returns trigger language plpgsql as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated' then
    new.recursos := old.recursos;
    new.user_id  := old.user_id;
    new.pedido_id := old.pedido_id;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists convites_proteger on public.convites;
create trigger convites_proteger before update on public.convites
  for each row execute function public.proteger_convite();

-- ============================================================
-- CONFIRMAÇÕES — o que os convidados respondem
-- ============================================================
create table if not exists public.confirmacoes (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  convite_id  uuid not null references public.convites(id) on delete cascade,
  nome        text not null check (length(nome) between 1 and 80),
  vai         boolean not null,
  pessoas     int not null default 1 check (pessoas between 0 and 10),
  recado      text check (length(recado) <= 400)
);
create index if not exists confirmacoes_convite_idx on public.confirmacoes (convite_id, criado_em desc);
alter table public.confirmacoes enable row level security;

drop policy if exists "dono lê as confirmações" on public.confirmacoes;
create policy "dono lê as confirmações" on public.confirmacoes
  for select using (exists (select 1 from public.convites c where c.id = convite_id and c.user_id = auth.uid()));

drop policy if exists "dono apaga confirmação" on public.confirmacoes;
create policy "dono apaga confirmação" on public.confirmacoes
  for delete using (exists (select 1 from public.convites c where c.id = convite_id and c.user_id = auth.uid()));

-- ============================================================
-- FUNÇÕES PÚBLICAS (quem chama é o convidado, sem login)
-- ============================================================

-- O convite aberto pelo link. Só devolve se estiver publicado e dentro do prazo.
create or replace function public.convite_publico(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select c.dados || jsonb_build_object('slug', c.slug, 'modelo', c.modelo, 'recursos', c.recursos)
  from public.convites c
  where c.slug = lower(p_slug)
    and c.publicado
    and (c.expira_em is null or c.expira_em >= current_date)
$$;

-- O convidado responde. Não precisa (e não pode) ler nada.
create or replace function public.confirmar_presenca(p_slug text, p_nome text, p_vai boolean, p_pessoas int, p_recado text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.convites
   where slug = lower(p_slug) and publicado and (expira_em is null or expira_em >= current_date);
  if v_id is null then raise exception 'convite não encontrado'; end if;
  insert into public.confirmacoes (convite_id, nome, vai, pessoas, recado)
  values (v_id, left(trim(p_nome), 80), p_vai, case when p_vai then greatest(1, least(coalesce(p_pessoas, 1), 10)) else 0 end, left(nullif(trim(p_recado), ''), 400));
end $$;

-- O editor pergunta se o endereço está livre.
create or replace function public.slug_livre(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.convites where slug = lower(p_slug) and user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
$$;

-- O checkout acompanha o Pix. Devolve só o status; o id do pedido é um uuid impossível de adivinhar.
create or replace function public.status_pedido(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select status from public.pedidos where id = p_id
$$;

grant execute on function public.convite_publico(text) to anon, authenticated;
grant execute on function public.confirmar_presenca(text, text, boolean, int, text) to anon, authenticated;
grant execute on function public.slug_livre(text) to anon, authenticated;
grant execute on function public.status_pedido(uuid) to anon, authenticated;

-- Usada pelas Edge Functions para achar a conta de quem comprou de novo.
create or replace function public.user_id_por_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke execute on function public.user_id_por_email(text) from public, anon, authenticated;

-- ============================================================
-- tocar atualizado_em
-- ============================================================
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
drop trigger if exists pedidos_atualizado_em on public.pedidos;
create trigger pedidos_atualizado_em before update on public.pedidos
  for each row execute function public.tocar_atualizado_em();

-- ============================================================
-- FOTOS — bucket público de leitura; cada casal só mexe na própria pasta
-- caminho: fotos/<user_id>/<arquivo>.jpg
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "casal sobe foto na própria pasta" on storage.objects;
create policy "casal sobe foto na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "casal troca foto da própria pasta" on storage.objects;
create policy "casal troca foto da própria pasta" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "casal apaga foto da própria pasta" on storage.objects;
create policy "casal apaga foto da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- VENDAS POR DIA — o painel ADM lê daqui
-- ============================================================
create or replace view public.vendas_por_dia with (security_invoker = true) as
select
  date_trunc('day', criado_em at time zone 'America/Sao_Paulo')::date as dia,
  count(*)                                                            as vendas,
  sum(valor)                                                          as faturamento,
  round(avg(valor), 2)                                                as ticket_medio,
  count(*) filter (where (itens->>'padrinhos')::boolean)              as com_padrinhos,
  count(*) filter (where (itens->>'pix')::boolean)                    as com_pix
from public.pedidos
where status = 'aprovado'
group by 1
order by 1 desc;

-- ============================================================
-- Senha criada no /parabens (uma vez por pedido).
alter table public.pedidos add column if not exists senha_definida_em timestamptz;

-- A conta já tem senha? (cliente antigo não pode ter a senha trocada pelo /parabens)
create or replace function public.usuario_tem_senha(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(encrypted_password, '') <> '' from auth.users where id = p_uid
$$;
revoke execute on function public.usuario_tem_senha(uuid) from public, anon, authenticated;

-- ============================================================
-- Mesma estrutura do ViralFlow: pagar NÃO cria conta.
-- A conta nasce no /parabens (signUp com o e-mail da compra) ou no painel ADM,
-- e a compra é ligada pelo e-mail (o activate_pending_checkout de lá).

-- Liga ao usuário logado todas as compras aprovadas do e-mail dele que ainda
-- não têm dono, e cria o convite de cada uma. Chamada depois do signUp e a cada login.
create or replace function public.ativar_compras()
returns int language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_n int := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  for r in
    select id, itens from public.pedidos
    where lower(email) = v_email and status = 'aprovado' and user_id is null
  loop
    update public.pedidos set user_id = v_uid where id = r.id;
    insert into public.convites (user_id, pedido_id, recursos)
    values (v_uid, r.id, jsonb_build_object(
      'padrinhos', coalesce((r.itens->>'padrinhos')::boolean, false),
      'pix',       coalesce((r.itens->>'pix')::boolean, false)))
    on conflict (pedido_id) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.ativar_compras() from public, anon;
grant execute on function public.ativar_compras() to authenticated;

-- O /parabens só deixa criar conta se o e-mail tiver compra aprovada.
create or replace function public.tem_compra(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pedidos where lower(email) = lower(trim(p_email)) and status = 'aprovado')
$$;
grant execute on function public.tem_compra(text) to anon, authenticated;

-- A função do link por pedido saiu (substituída por este fluxo).
drop function if exists public.usuario_tem_senha(uuid);

-- ============================================================
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
