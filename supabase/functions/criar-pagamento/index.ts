// Cria a cobrança no Mercado Pago (Checkout Transparente: Pix + cartão).
// Deploy: supabase functions deploy criar-pagamento --no-verify-jwt
// Base: o checkout do workshop do Vinicius, que por sua vez segue o do ViralFlow.

import { PRODUTO, calcularTotal, cors, entregar, env, json, limparItens, servico, soDigitos } from "../_shared/comum.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  const sb = servico();
  let pedidoId: string | null = null;

  try {
    const { comprador = {}, itens = {}, pagamento = {} } = await req.json();

    const nome = String(comprador.nome ?? "").trim().slice(0, 120);
    const email = String(comprador.email ?? "").trim().toLowerCase();
    const whatsapp = soDigitos(comprador.whatsapp);
    const cpf = soDigitos(pagamento?.payer?.identification?.number ?? comprador.cpf);

    // Como no ViralFlow: só o e-mail é obrigatório. No cartão, o CPF vem do formulário do MP.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ erro: "E-mail inválido. É por ele que o acesso chega." }, 400);
    if (whatsapp && whatsapp.length !== 10 && whatsapp.length !== 11) return json({ erro: "WhatsApp inválido. Coloque DDD + número." }, 400);

    const itensLimpos = limparItens(itens);
    const valor = calcularTotal(itensLimpos);
    const metodo = String(pagamento.payment_method_id ?? "");
    if (!metodo) return json({ erro: "Escolha uma forma de pagamento." }, 400);

    // Grava o pedido ANTES de cobrar, para nada se perder.
    const { data: pedido, error: erroPedido } = await sb.from("pedidos")
      .insert({ nome, email, whatsapp: whatsapp || null, cpf: cpf || null, itens: itensLimpos, valor, metodo, status: "pendente" })
      .select("id").single();
    if (erroPedido) throw new Error("gravar pedido: " + erroPedido.message);
    pedidoId = pedido.id;

    const payer: Record<string, unknown> = { email };
    if (nome) { const [primeiro, ...resto] = nome.split(/\s+/); payer.first_name = primeiro; payer.last_name = resto.join(" ") || primeiro; }
    if (cpf.length === 11) payer.identification = { type: "CPF", number: cpf };
    else if (pagamento?.payer?.identification?.number) payer.identification = pagamento.payer.identification;
    const corpo: Record<string, unknown> = {
      transaction_amount: valor, // valor do servidor, nunca do navegador
      description: PRODUTO,
      payment_method_id: metodo,
      external_reference: pedidoId,
      notification_url: `${env("SUPABASE_URL")}/functions/v1/mp-webhook`,
      statement_descriptor: "PODEABRIR",
      metadata: { pedido_id: pedidoId, itens: itensLimpos },
      payer,
    };
    if (metodo === "pix") {
      corpo.date_of_expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace("Z", "-00:00");
    } else {
      if (!pagamento.token) return json({ erro: "Não consegui validar o cartão. Tente de novo." }, 400);
      corpo.token = pagamento.token;
      corpo.installments = Number(pagamento.installments ?? 1);
      if (pagamento.issuer_id) corpo.issuer_id = pagamento.issuer_id;
    }

    const r = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env("MP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": pedidoId!, // clique duplo não cobra duas vezes
      },
      body: JSON.stringify(corpo),
    });
    const mp = await r.json();

    if (!r.ok) {
      await sb.from("pedidos").update({ status: "recusado", status_detalhe: mp?.message ?? "erro na API" }).eq("id", pedidoId);
      console.error("MP recusou:", JSON.stringify(mp));
      return json({ erro: "Não foi possível processar o pagamento. Confira os dados e tente de novo." }, 400);
    }

    const status = mp.status === "approved" ? "aprovado" : mp.status === "rejected" ? "recusado" : "pendente";
    await sb.from("pedidos").update({ mp_payment_id: String(mp.id), status, status_detalhe: mp.status_detail }).eq("id", pedidoId);

    // Cartão aprovado na hora: entrega já. (O webhook também tenta; a trava impede e-mail duplicado.)
    if (status === "aprovado") await entregar(sb, pedidoId!);

    const pix = mp?.point_of_interaction?.transaction_data;
    return json({
      pedido_id: pedidoId,
      status: mp.status,
      status_detalhe: mp.status_detail,
      valor,
      pix: metodo === "pix" && pix ? { copia_e_cola: pix.qr_code, qr_base64: pix.qr_code_base64, expira_em: mp.date_of_expiration } : null,
    });
  } catch (e) {
    console.error("criar-pagamento:", e);
    if (pedidoId) await sb.from("pedidos").update({ status: "recusado", status_detalhe: "erro interno" }).eq("id", pedidoId);
    return json({ erro: "Tivemos um problema aqui. Tente de novo em instantes." }, 500);
  }
});
