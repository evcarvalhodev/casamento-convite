// Painel ADM (/adm). Só responde para os e-mails em ADMIN_EMAILS.
// Deploy: supabase functions deploy admin --no-verify-jwt
// (o JWT é conferido aqui dentro, pelo e-mail — mesmo modelo do admin-panel do ViralFlow)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { admins, calcularTotal, cors, entregar, enviarAcesso, env, json, limparItens, servico } from "../_shared/comum.ts";

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
      const foi = await enviarAcesso(sb, p.email, p.nome, false);
      return json({ ok: foi, mensagem: foi ? "Link reenviado para " + p.email : "A Resend recusou o envio. Veja os logs." });
    }

    // Libera acesso sem pagamento (cortesia, parceria, reembolso trocado etc.).
    if (acao === "cortesia") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const nome = String(body.nome ?? "").trim() || email;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: "E-mail inválido" }, 400);
      const itens = limparItens(body.itens ?? {});
      const { data: p, error } = await sb.from("pedidos")
        .insert({ nome, email, itens, valor: 0, metodo: "cortesia", status: "aprovado", status_detalhe: "liberado por " + user.email })
        .select("id").single();
      if (error) return json({ erro: error.message }, 500);
      await entregar(sb, p.id);
      return json({ ok: true, mensagem: `Acesso liberado para ${email} (valor de tabela R$ ${calcularTotal(itens).toFixed(2)}).` });
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
