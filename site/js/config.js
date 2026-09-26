// Chaves PÚBLICAS — podem ficar no site. (A secreta do MP e a service_role nunca vêm pra cá.)
// Preencher depois de criar o projeto no Supabase e pegar a Public Key no Mercado Pago.
window.CONFIG = {
  SITE: "https://casamento-convite-cyan.vercel.app", // trocar por https://podeabrir.com.br quando o domínio estiver ligado
  DOMINIO: "casamento-convite-cyan.vercel.app/",
  SUPABASE_URL: "https://coljzmrayylamocnzgzo.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbGp6bXJheXlsYW1vY256Z3pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MzA0NjAsImV4cCI6MjEwNjAwNjQ2MH0.369H-IXRg2DaMK34xNDiqdveX16qlp9p3TpDWbE9Pxc",
  MP_PUBLIC_KEY: "APP_USR-e47488f5-021f-4c0b-89a9-e8532c3f2ea7",
  PRECOS: { base: 0.5, padrinhos: 0.5, pix: 0.5 }, // ⚠️ TESTE — voltar pra 67 / 27 / 19.9 // só pra MOSTRAR. Quem cobra é o criar-pagamento.
};
