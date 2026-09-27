-- Dados de atribuição capturados no checkout, pra API de Conversões da Meta
-- ligar a compra ao anúncio: {"fbp":"fb.1...","fbc":"fb.1...","ip":"...","ua":"...","url":"..."}
alter table public.pedidos add column if not exists rastreio jsonb;
-- Quando a compra foi mandada pra Meta pelo servidor (evita mandar duas vezes).
alter table public.pedidos add column if not exists meta_enviado_em timestamptz;
