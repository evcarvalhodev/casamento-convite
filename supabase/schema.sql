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
