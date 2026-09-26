// Webhook do Mercado Pago. É aqui que o Pix vira "aprovado" e o acesso é entregue.
// Deploy: supabase functions deploy mp-webhook --no-verify-jwt
// Cadastrar no painel do MP (Suas integrações > Webhooks > Pagamentos):
//   https://<projeto>.supabase.co/functions/v1/mp-webhook

import { entregar, env, servico } from "../_shared/comum.ts";

const ok = () => new Response("ok", { status: 200 });

// Assinatura do MP: header x-signature = "ts=...,v1=..."
// manifesto = id:<data.id>;request-id:<x-request-id>;ts:<ts>;
async function assinaturaConfere(req: Request, dataId: string): Promise<boolean> {
  const segredo = env("MP_WEBHOOK_SECRET");
  if (!segredo) { console.warn("MP_WEBHOOK_SECRET não configurado — pulando validação"); return true; }
  const partes = Object.fromEntries(
    (req.headers.get("x-signature") ?? "").split(",").map((p) => p.split("=").map((s) => s.trim())),
  ) as Record<string, string>;
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${dataId};request-id:${req.headers.get("x-request-id") ?? ""};ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("") === partes.v1;
}

function traduzStatus(s: string): string {
  if (s === "approved") return "aprovado";
  if (s === "rejected" || s === "cancelled") return "recusado";
  if (s === "refunded" || s === "charged_back") return "estornado";
  return "pendente";
}

Deno.serve(async (req) => {
  // Sempre 200: o MP reenvia em cima de qualquer erro e vira fila infinita.
  try {
    const url = new URL(req.url);
    const corpo = await req.json().catch(() => ({} as Record<string, unknown>)) as any;
    const tipo = corpo?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
    const dataId = String(corpo?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
    if (tipo !== "payment" || !dataId) return ok();

    if (!(await assinaturaConfere(req, dataId))) { console.error("assinatura inválida", dataId); return ok(); }

    // Nunca confiar no corpo da notificação: buscar o pagamento na fonte.
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { "Authorization": `Bearer ${env("MP_ACCESS_TOKEN")}` },
    });
    if (!r.ok) { console.error("não consegui buscar o pagamento", dataId, r.status); return ok(); }
    const pgto = await r.json();

    const sb = servico();
    const pedidoId = pgto.external_reference ?? pgto?.metadata?.pedido_id;
    const novo = { status: traduzStatus(pgto.status), status_detalhe: pgto.status_detail, mp_payment_id: String(pgto.id), metodo: pgto.payment_method_id };

    const q = sb.from("pedidos").update(novo);
    const { data: linha, error } = await (pedidoId ? q.eq("id", pedidoId) : q.eq("mp_payment_id", String(pgto.id))).select("id").maybeSingle();
    if (error) console.error("atualizar pedido:", error.message);
    console.log(`pagamento ${pgto.id} -> ${novo.status} (pedido ${linha?.id ?? "?"})`);

    if (novo.status === "aprovado" && linha?.id) await entregar(sb, linha.id);

    // Estorno/chargeback: tira o convite do ar.
    if (novo.status === "estornado" && linha?.id) {
      await sb.from("convites").update({ publicado: false }).eq("pedido_id", linha.id);
    }
    return ok();
  } catch (e) {
    console.error("mp-webhook:", e);
    return ok();
  }
});
