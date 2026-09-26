// Peças usadas por mais de uma Edge Function.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN     token de PRODUÇÃO do Mercado Pago
//   MP_WEBHOOK_SECRET   "assinatura secreta" do webhook no painel do MP
//   RESEND_API_KEY      chave da Resend
//   EMAIL_FROM          ex.: Pode Abrir <acesso@podeabrir.com.br>  (domínio verificado na Resend)
//   SITE_URL            ex.: https://podeabrir.com.br  (sem barra no fim)
//   ADMIN_EMAILS        e-mails do painel ADM, separados por vírgula
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY  já vêm prontos

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---- PREÇO MORA AQUI. O navegador nunca manda valor. ----
// Mudou preço? Muda a página de vendas e o checkout.html no MESMO deploy.
export const PRECOS = {
  base: 67.0,       // convite interativo
  padrinhos: 27.0,  // orderbump: convite dos padrinhos
  pix: 19.9,        // orderbump: presentes no Pix
} as const;
export const PRODUTO = "Pode Abrir - Convite de casamento";

export type Itens = { base: true; padrinhos: boolean; pix: boolean };

export function limparItens(itens: Record<string, unknown> = {}): Itens {
  return { base: true, padrinhos: itens.padrinhos === true, pix: itens.pix === true };
}
export function calcularTotal(itens: Itens): number {
  let t = PRECOS.base;
  if (itens.padrinhos) t += PRECOS.padrinhos;
  if (itens.pix) t += PRECOS.pix;
  return Number(t.toFixed(2));
}

export const env = (k: string) => Deno.env.get(k) ?? "";
export const SITE = () => env("SITE_URL").replace(/\/+$/, "");
export const admins = () => env("ADMIN_EMAILS").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export function servico(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function cors(origem = "*") {
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(), "content-type": "application/json" } });

export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const esc = (t: unknown) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ---- E-MAIL ----
// Regra que veio do ViralFlow: e-mail transacional é só <p>, <strong> e link cru.
// Sem botão colorido, sem banner, sem rodapé cinza — senão o Gmail joga em Promoções
// e a noiva não acha o acesso.
export async function enviarEmail(para: string, assunto: string, html: string): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM"), to: [para], subject: assunto, html }),
  });
  if (!r.ok) console.error("resend falhou:", r.status, await r.text());
  return r.ok;
}

// Link que já entra logado e cai no editor. Vale uma vez; se expirar, a pessoa
// pede outro em /entrar.
export async function linkDeAcesso(sb: SupabaseClient, email: string, destino = "/criar"): Promise<string> {
  const { data, error } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: SITE() + destino },
  });
  if (error) throw new Error("generateLink: " + error.message);
  return data.properties.action_link;
}

// Liga um pedido aprovado a uma conta que JÁ existe (cliente que comprou de novo,
// ou conta criada antes pelo ADM). Conta nova NÃO é criada aqui: como no ViralFlow,
// ela nasce no /parabens (a pessoa escolhe a senha) ou no painel ADM.
export async function ligarAConta(sb: SupabaseClient, pedido: { id: string; email: string; itens: Record<string, boolean> }): Promise<string | null> {
  const { data: uid } = await sb.rpc("user_id_por_email", { p_email: pedido.email });
  if (!uid) return null;
  await sb.from("pedidos").update({ user_id: uid }).eq("id", pedido.id);
  const { error } = await sb.from("convites").upsert({
    user_id: uid,
    pedido_id: pedido.id,
    recursos: { padrinhos: !!pedido.itens?.padrinhos, pix: !!pedido.itens?.pix },
  }, { onConflict: "pedido_id", ignoreDuplicates: true });
  if (error) throw new Error("convite: " + error.message);
  return uid as string;
}

// ---- ENTREGA ----
// Chamada quando um pedido vira "aprovado" (criar-pagamento no cartão aprovado na
// hora, ou mp-webhook no Pix). Os dois podem chegar juntos: a trava é o
// UPDATE ... WHERE acesso_enviado_em IS NULL — só um vence.
export async function entregar(sb: SupabaseClient, pedidoId: string): Promise<void> {
  const { data: pedido, error } = await sb
    .from("pedidos")
    .update({ acesso_enviado_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq("status", "aprovado")
    .is("acesso_enviado_em", null)
    .select("id, nome, email, itens, valor")
    .maybeSingle();
  if (error) { console.error("entregar/trava:", error.message); return; }
  if (!pedido) return;

  try {
    const uid = await ligarAConta(sb, pedido);
    await enviarAcesso(sb, pedido.email, pedido.nome, !uid);
    await avisarAdmin(pedido);
  } catch (e) {
    console.error("entregar falhou:", e);
    await sb.from("pedidos").update({ acesso_enviado_em: null }).eq("id", pedido.id);
  }
}

// semConta = true → manda criar a senha no /parabens. Senão, link que já entra logado.
export async function enviarAcesso(sb: SupabaseClient, email: string, nome: string, semConta: boolean): Promise<boolean> {
  const primeiro = esc(String(nome || "").split(/\s+/)[0] || "");
  const oi = primeiro ? `<p>Oi, ${primeiro}!</p>` : "<p>Oi!</p>";
  if (semConta) {
    const link = `${SITE()}/parabens?email=${encodeURIComponent(email)}`;
    return enviarEmail(email, "Seu convite está pronto para montar", `${oi}
<p>Seu pagamento foi aprovado. Para montar o convite de vocês, crie sua senha neste link (use este mesmo e-mail):</p>
<p>${link}</p>
<p>Leva uns 10 minutos: escolher o modelo, colocar os nomes, a data, as fotos e o local. No fim você recebe o link do convite pra mandar no WhatsApp.</p>
<p>Depois é só entrar em ${SITE()}/entrar com o e-mail e a senha.</p>
<p>Felicidades aos dois!<br>Pode Abrir</p>`);
  }
  const link = await linkDeAcesso(sb, email);
  return enviarEmail(email, "Seu link para entrar", `${oi}
<p>Aqui está o seu link para entrar no Pode Abrir:</p>
<p>${link}</p>
<p>Ele vale uma vez. Se não foi você que pediu, pode ignorar este e-mail.</p>
<p>Pode Abrir</p>`);
}

async function avisarAdmin(pedido: { nome: string; email: string; itens: Record<string, boolean>; valor: number }) {
  const extras = [pedido.itens?.padrinhos && "Padrinhos", pedido.itens?.pix && "Pix"].filter(Boolean).join(" + ");
  const valor = Number(pedido.valor).toFixed(2).replace(".", ",");
  for (const a of admins()) {
    await enviarEmail(a, `Venda: R$ ${valor}${extras ? " (" + extras + ")" : ""}`,
      `<p>${esc(pedido.nome || pedido.email)} (${esc(pedido.email)}) comprou por R$ ${valor}.</p><p>Extras: ${extras || "nenhum"}.</p>`);
  }
}
