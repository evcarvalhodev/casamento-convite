-- Senha criada no /parabens (uma vez por pedido).
alter table public.pedidos add column if not exists senha_definida_em timestamptz;

-- A conta já tem senha? (cliente antigo não pode ter a senha trocada pelo /parabens)
create or replace function public.usuario_tem_senha(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(encrypted_password, '') <> '' from auth.users where id = p_uid
$$;
revoke execute on function public.usuario_tem_senha(uuid) from public, anon, authenticated;
