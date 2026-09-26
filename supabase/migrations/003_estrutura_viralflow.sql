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
