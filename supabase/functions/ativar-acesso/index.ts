// Tela /parabens: logo depois de pagar, a pessoa cria a senha e entra — sem depender
// do e-mail chegar (mesma ideia do /parabens do ViralFlow).
// Deploy: supabase functions deploy ativar-acesso --no-verify-jwt
//
// Segurança: só funciona com o id do pedido (uuid que só existe no navegador de
// quem pagou), só em pedido aprovado, só UMA vez por pedido, e nunca troca a
// senha de uma conta que já tem senha (cliente antigo → manda pro /entrar).

import { cors, entregar, json, servico } from "../_shared/comum.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  try {
    const { pedido_id, senha, so_consultar } = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(pedido_id ?? ""))) return json({ erro: "Pedido inválido." }, 400);

    const sb = servico();
    const { data: p, error } = await sb.from("pedidos")
      .select("id, email, status, user_id, senha_definida_em").eq("id", pedido_id).maybeSingle();
    if (error || !p) return json({ erro: "Pedido não encontrado." }, 404);
    if (p.status !== "aprovado") return json({ estado: "pendente", email: p.email });

    // Garante conta + convite (idempotente; o webhook pode ter feito antes).
    if (!p.user_id) await entregar(sb, p.id);
    const { data: p2 } = await sb.from("pedidos").select("user_id").eq("id", p.id).single();
    const uid = p2?.user_id;
    if (!uid) return json({ erro: "Ainda estamos liberando seu acesso. Tente de novo em alguns segundos." }, 409);

    // Conta criada sem senha recebe do Supabase uma senha ALEATÓRIA com cara de
    // senha real (medido: todas têm hash $2a$ de 60 caracteres). Então "tem senha?"
    // não dá pra ler da conta — a marca é nossa: app_metadata.senha_criada.
    const { data: u } = await sb.auth.admin.getUserById(uid);
    const temSenha = u?.user?.app_metadata?.senha_criada === true;
    const podeCriar = !p.senha_definida_em && !temSenha;

    if (so_consultar) return json({ estado: podeCriar ? "criar_senha" : "ja_tem_senha", email: p.email });
    if (!podeCriar) return json({ estado: "ja_tem_senha", email: p.email });

    const s = String(senha ?? "");
    if (s.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);

    const { error: eUp } = await sb.auth.admin.updateUserById(uid, {
      password: s,
      app_metadata: { ...(u?.user?.app_metadata ?? {}), senha_criada: true },
    });
    if (eUp) { console.error("updateUserById:", eUp.message); return json({ erro: "Não conseguimos salvar a senha. Tente de novo." }, 500); }
    await sb.from("pedidos").update({ senha_definida_em: new Date().toISOString() }).eq("id", p.id);

    return json({ estado: "pronto", email: p.email });
  } catch (e) {
    console.error("ativar-acesso:", e);
    return json({ erro: "Tivemos um problema aqui. Tente de novo em instantes." }, 500);
  }
});
