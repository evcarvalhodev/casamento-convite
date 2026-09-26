// Chaves PÚBLICAS — podem ficar no site. (A secreta do MP e a service_role nunca vêm pra cá.)
// Preencher depois de criar o projeto no Supabase e pegar a Public Key no Mercado Pago.
window.CONFIG = {
  SITE: "https://podeabrir.com.br",
  DOMINIO: "podeabrir.com.br/",
  SUPABASE_URL: "https://coljzmrayylamocnzgzo.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbGp6bXJheXlsYW1vY256Z3pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MzA0NjAsImV4cCI6MjEwNjAwNjQ2MH0.369H-IXRg2DaMK34xNDiqdveX16qlp9p3TpDWbE9Pxc",
  MP_PUBLIC_KEY: "APP_USR-COLE-A-PUBLIC-KEY",
  PRECOS: { base: 67, padrinhos: 27, pix: 19.9 }, // só pra MOSTRAR. Quem cobra é o criar-pagamento.
};
