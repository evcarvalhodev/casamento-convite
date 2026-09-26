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

async function garantirUsuario(sb: SupabaseClient, email: string, nome: string): Promise<string> {
  const { data: criado, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (criado?.user) return criado.user.id;
  // Já tem conta (comprou antes): acha pelo e-mail.
  const { data: id, error: e2 } = await sb.rpc("user_id_por_email", { p_email: email });
  if (e2 || !id) throw new Error("não achei nem criei a conta: " + (error?.message ?? "") + " " + (e2?.message ?? ""));
  return id as string;
}

// ---- ENTREGA ----
// Chamada quando um pedido vira "aprovado" (pelo criar-pagamento no cartão
// aprovado na hora, ou pelo mp-webhook no Pix). Os dois podem chegar ao mesmo
// tempo: a trava é o UPDATE ... WHERE acesso_enviado_em IS NULL — só um vence.
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
  if (!pedido) return; // outro já entregou, ou não está aprovado

  try {
    const userId = await garantirUsuario(sb, pedido.email, pedido.nome);
    await sb.from("pedidos").update({ user_id: userId }).eq("id", pedido.id);

    const { error: eConv } = await sb.from("convites").upsert({
      user_id: userId,
      pedido_id: pedido.id,
      recursos: { padrinhos: !!pedido.itens?.padrinhos, pix: !!pedido.itens?.pix },
    }, { onConflict: "pedido_id", ignoreDuplicates: true });
    if (eConv) throw new Error("convite: " + eConv.message);

    await enviarAcesso(sb, pedido.email, pedido.nome, true);
    await avisarAdmin(pedido);
  } catch (e) {
    // Solta a trava para o próximo webhook (ou o botão do painel ADM) tentar de novo.
    console.error("entregar falhou:", e);
    await sb.from("pedidos").update({ acesso_enviado_em: null }).eq("id", pedido.id);
  }
}

export async function enviarAcesso(sb: SupabaseClient, email: string, nome: string, primeiraVez: boolean): Promise<boolean> {
  const link = await linkDeAcesso(sb, email);
  const primeiro = esc(String(nome || "").split(/\s+/)[0] || "");
  const oi = primeiro ? `<p>Oi, ${primeiro}!</p>` : "<p>Oi!</p>";
  const html = primeiraVez
    ? `${oi}
<p>Seu pagamento foi aprovado. Para montar o convite de vocês, é só abrir este link no celular:</p>
<p>${link}</p>
<p>Leva uns 10 minutos: escolher o modelo, colocar os nomes, a data, as fotos e o local. No fim você recebe o link do convite pra mandar no WhatsApp.</p>
<p>Esse link de acesso vale uma vez. Para entrar de novo depois, use ${SITE()}/entrar com este mesmo e-mail.</p>
<p>Felicidades aos dois!<br>Pode Abrir</p>`
    : `${oi}
<p>Aqui está o seu link para entrar no Pode Abrir:</p>
<p>${link}</p>
<p>Ele vale uma vez. Se não foi você que pediu, pode ignorar este e-mail.</p>
<p>Pode Abrir</p>`;
  return enviarEmail(email, primeiraVez ? "Seu convite está pronto para montar" : "Seu link para entrar", html);
}

async function avisarAdmin(pedido: { nome: string; email: string; itens: Record<string, boolean>; valor: number }) {
  const extras = [pedido.itens?.padrinhos && "Padrinhos", pedido.itens?.pix && "Pix"].filter(Boolean).join(" + ");
  const valor = Number(pedido.valor).toFixed(2).replace(".", ",");
  for (const a of admins()) {
    await enviarEmail(a, `Venda: R$ ${valor}${extras ? " (" + extras + ")" : ""}`,
      `<p>${esc(pedido.nome || pedido.email)} (${esc(pedido.email)}) comprou por R$ ${valor}.</p><p>Extras: ${extras || "nenhum"}.</p>`);
  }
}
