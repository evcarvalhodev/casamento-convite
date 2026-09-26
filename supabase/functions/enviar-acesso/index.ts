// Tela /entrar: a pessoa digita o e-mail e recebe um link que já entra logado.
// Só manda para quem tem compra aprovada (ou é ADM). A resposta é SEMPRE a mesma,
// pra ninguém descobrir quais e-mails são clientes.
// Deploy: supabase functions deploy enviar-acesso --no-verify-jwt

import { admins, cors, enviarAcesso, enviarEmail, json, linkDeAcesso, servico } from "../_shared/comum.ts";

const RESPOSTA = { ok: true, mensagem: "Se esse e-mail tiver uma compra, o link chega em até 2 minutos. Confira também o spam." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  try {
    const { email: bruto } = await req.json();
    const email = String(bruto ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, mensagem: "Digite um e-mail válido." }, 400);

    const sb = servico();

    if (admins().includes(email)) {
      // ADM pode ainda não ter conta: cria na primeira vez.
      await sb.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
      const link = await linkDeAcesso(sb, email, "/adm");
      await enviarEmail(email, "Seu link do painel", `<p>Link do painel ADM do Pode Abrir:</p><p>${link}</p><p>Vale uma vez.</p>`);
      return json(RESPOSTA);
    }

    const { data: pedido } = await sb.from("pedidos")
      .select("nome").eq("email", email).eq("status", "aprovado")
      .order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (pedido) await enviarAcesso(sb, email, pedido.nome, false);

    return json(RESPOSTA);
  } catch (e) {
    console.error("enviar-acesso:", e);
    return json({ ok: false, mensagem: "Não conseguimos enviar agora. Tente de novo em instantes." }, 500);
  }
});
