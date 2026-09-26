// Painel ADM (/adm). Só responde para os e-mails em ADMIN_EMAILS.
// Deploy: supabase functions deploy admin --no-verify-jwt
// (o JWT é conferido aqui dentro, pelo e-mail — mesmo modelo do admin-panel do ViralFlow)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { admins, cors, entregar, enviarAcesso, env, json, ligarAConta, limparItens, servico } from "../_shared/comum.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data: { user }, error: eAuth } = await anon.auth.getUser(token);
    if (eAuth || !user?.email || !admins().includes(user.email.toLowerCase())) return json({ erro: "Acesso negado" }, 403);

    const sb = servico();
    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? "resumo");

    if (acao === "resumo") {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString();
      // ⚠️ PostgREST corta em 1000 linhas: sempre ordenar do mais novo pro mais velho.
      const [ped, conv, conf, dias] = await Promise.all([
        sb.from("pedidos").select("id, criado_em, nome, email, whatsapp, itens, valor, metodo, status, status_detalhe, acesso_enviado_em, mp_payment_id")
          .gte("criado_em", desde).order("criado_em", { ascending: false }).limit(500),
        sb.from("convites").select("id, criado_em, slug, modelo, publicado, data_evento, recursos, nome1:dados->>nome1, nome2:dados->>nome2, pedido_id, user_id")
          .order("criado_em", { ascending: false }).limit(500),
        sb.from("confirmacoes").select("convite_id, vai, pessoas").order("criado_em", { ascending: false }).limit(1000),
        sb.from("vendas_por_dia").select("*").limit(30),
      ]);
      for (const r of [ped, conv, conf, dias]) if (r.error) return json({ erro: r.error.message }, 500);

      const porConvite: Record<string, { sim: number; nao: number; pessoas: number }> = {};
      for (const c of conf.data ?? []) {
        const x = (porConvite[c.convite_id] ??= { sim: 0, nao: 0, pessoas: 0 });
        if (c.vai) { x.sim++; x.pessoas += c.pessoas; } else x.nao++;
      }
      return json({
        pedidos: ped.data,
        convites: (conv.data ?? []).map((c: any) => ({ ...c, respostas: porConvite[c.id] ?? { sim: 0, nao: 0, pessoas: 0 } })),
        dias: dias.data,
      });
    }

    // Reenvia o link de acesso de um pedido aprovado.
    if (acao === "reenviar") {
      const { data: p, error } = await sb.from("pedidos").select("id, nome, email, status, acesso_enviado_em").eq("id", body.pedido_id).single();
      if (error || !p) return json({ erro: "Pedido não encontrado" }, 404);
      if (p.status !== "aprovado") return json({ erro: "Pedido não está aprovado" }, 400);
      if (!p.acesso_enviado_em) { await entregar(sb, p.id); return json({ ok: true, mensagem: "Entrega feita agora (não tinha saído)." }); }
      const { data: uid } = await sb.rpc("user_id_por_email", { p_email: p.email });
      const foi = await enviarAcesso(sb, p.email, p.nome, !uid);
      return json({ ok: foi, mensagem: foi ? "Link reenviado para " + p.email : "A Resend recusou o envio. Veja os logs." });
    }

    // Cria conta com senha e já libera o convite (o "create" do painel do ViralFlow).
    // Serve pra cortesia, parceria, cliente que pagou por fora — e pra testar.
    if (acao === "criar_conta") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const senha = String(body.senha ?? "");
      const nome = String(body.nome ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: "E-mail inválido" }, 400);
      if (senha.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres" }, 400);
      const { error: eU } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (eU) return json({ erro: /already|registered|exists/i.test(eU.message) ? "Já existe conta com esse e-mail. Use \"Trocar senha\"." : eU.message }, 400);
      const itens = limparItens(body.itens ?? {});
      const { data: p, error } = await sb.from("pedidos")
        .insert({ nome, email, itens, valor: 0, metodo: "cortesia", status: "aprovado", status_detalhe: "conta criada por " + user.email, acesso_enviado_em: new Date().toISOString() })
        .select("id, email, itens").single();
      if (error) return json({ erro: error.message }, 500);
      await ligarAConta(sb, p);
      return json({ ok: true, mensagem: `Conta criada: ${email}. Já pode entrar em /entrar com a senha.` });
    }

    // Troca a senha de uma conta (o "reset_password" do painel do ViralFlow).
    if (acao === "trocar_senha") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const senha = String(body.senha ?? "");
      if (senha.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres" }, 400);
      const { data: uid } = await sb.rpc("user_id_por_email", { p_email: email });
      if (!uid) return json({ erro: "Não existe conta com esse e-mail" }, 404);
      const { error } = await sb.auth.admin.updateUserById(uid as string, { password: senha });
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, mensagem: "Senha trocada para " + email });
    }

    // Lista de usuários (o "list" do painel do ViralFlow).
    if (acao === "usuarios") {
      const { data: lista, error } = await sb.auth.admin.listUsers({ perPage: 1000, page: 1 });
      if (error) return json({ erro: error.message }, 500);
      const [{ data: peds }, { data: convs }] = await Promise.all([
        sb.from("pedidos").select("user_id, valor, status").eq("status", "aprovado").not("user_id", "is", null).limit(1000),
        sb.from("convites").select("user_id, slug, publicado").limit(1000),
      ]);
      const adms = admins();
      const usuarios = (lista?.users ?? []).map((u: any) => ({
        id: u.id,
        email: u.email,
        nome: u.user_metadata?.nome ?? "",
        criado_em: u.created_at,
        ultimo_login: u.last_sign_in_at ?? null,
        adm: adms.includes(String(u.email).toLowerCase()),
        compras: (peds ?? []).filter((p: any) => p.user_id === u.id).length,
        convite: (convs ?? []).find((c: any) => c.user_id === u.id) ?? null,
      })).sort((x: any, y: any) => (y.criado_em > x.criado_em ? 1 : -1));
      return json({ usuarios });
    }

    // Exclui o usuário (o "delete" do painel do ViralFlow). Vai junto: convite,
    // confirmações e fotos. O pedido fica (é registro de venda), só perde o dono.
    if (acao === "excluir_usuario") {
      const uid = String(body.user_id ?? "");
      if (!uid) return json({ erro: "user_id é obrigatório" }, 400);
      if (uid === user.id) return json({ erro: "Você não pode excluir a própria conta." }, 400);
      const { data: alvo } = await sb.auth.admin.getUserById(uid);
      if (alvo?.user?.email && admins().includes(alvo.user.email.toLowerCase())) return json({ erro: "Não dá pra excluir um administrador por aqui." }, 400);
      for (const pasta of ["fotos", "audios"]) {
        const { data: arqs } = await sb.storage.from(pasta).list(uid, { limit: 1000 });
        if (arqs?.length) await sb.storage.from(pasta).remove(arqs.map((f: any) => `${uid}/${f.name}`));
      }
      const { error } = await sb.auth.admin.deleteUser(uid);
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, mensagem: "Usuário excluído" });
    }

    // Tira do ar / coloca no ar um convite (denúncia, estorno manual etc.).
    if (acao === "publicar") {
      const { error } = await sb.from("convites").update({ publicado: !!body.publicado }).eq("id", body.convite_id);
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true });
    }

    return json({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("admin:", e);
    return json({ erro: String(e) }, 500);
  }
});
