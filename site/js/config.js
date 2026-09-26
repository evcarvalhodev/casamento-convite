// Chaves PÚBLICAS — podem ficar no site. (A secreta do MP e a service_role nunca vêm pra cá.)
// Preencher depois de criar o projeto no Supabase e pegar a Public Key no Mercado Pago.
window.CONFIG = {
  SITE: "https://podeabrir.com.br",
  DOMINIO: "podeabrir.com.br/",
  SUPABASE_URL: "https://COLE-O-REF.supabase.co",
  SUPABASE_ANON_KEY: "COLE-A-ANON-KEY",
  MP_PUBLIC_KEY: "APP_USR-COLE-A-PUBLIC-KEY",
  PRECOS: { base: 67, padrinhos: 27, pix: 19.9 }, // só pra MOSTRAR. Quem cobra é o criar-pagamento.
};
