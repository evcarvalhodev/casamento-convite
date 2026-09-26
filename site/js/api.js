// Liga as páginas ao Supabase. Precisa do config.js e do supabase-js carregados antes.
(function () {
  const C = window.CONFIG;
  if (!C || !window.supabase || /COLE-/.test(C.SUPABASE_URL)) { console.warn("api.js: Supabase não configurado, modo demonstração"); return; }
  const SB = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  window.SB = SB;
  const fn = (nome) => `${C.SUPABASE_URL}/functions/v1/${nome}`;

  /* ---------- convite público (convite.html) ---------- */
  // /ana-e-pedro → carrega do banco. /convite ou /convite.html → demonstração (undefined).
  const RESERVADAS = ["", "convite", "convite.html"];
  window.carregarConvite = async function () {
    const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
    if (RESERVADAS.includes(slug)) return undefined;
    const { data, error } = await SB.rpc("convite_publico", { p_slug: slug });
    if (error) { console.error("convite_publico:", error); return null; }
    return data; // null = não existe, não publicado ou já expirou
  };
  window.salvarConfirmacao = async function (d) {
    if (!d.convite || d.convite === "demo" || d.convite === "previa") return; // demonstração não grava
    const { error } = await SB.rpc("confirmar_presenca", {
      p_slug: d.convite, p_nome: d.nome, p_vai: d.vai, p_pessoas: d.pessoas, p_recado: d.recado || "",
    });
    if (error) throw error;
  };

  /* ---------- sessão ---------- */
  async function sessao() {
    const { data: { session } } = await SB.auth.getSession();
    return session;
  }
  window.exigirLogin = async function (destino) {
    const s = await sessao();
    if (!s) { location.replace("/entrar" + (destino ? "?volta=" + encodeURIComponent(destino) : "")); return null; }
    // Compra feita antes de criar a conta (ou de outro e-mail já cadastrado) entra aqui.
    try { await SB.rpc("ativar_compras"); } catch (_) {}
    return s;
  };
  window.sair = async function () { await SB.auth.signOut(); location.href = "/entrar"; };

  /* ---------- casal (criar.html / painel.html) ---------- */
  async function meuConvite() {
    const { data, error } = await SB.from("convites")
      .select("id, slug, modelo, dados, publicado, recursos, data_evento")
      .order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  window.API = {
    meuConvite,

    async slugLivre(slug) {
      const { data, error } = await SB.rpc("slug_livre", { p_slug: slug });
      if (error) throw error;
      return data;
    },

    // fotos: [{ blob?, url }] na ordem (capa primeiro). Sobe só as novas; apaga as que saíram.
    async publicar(convite, fotos, editor) {
      const s = await sessao();
      if (!s) throw new Error("sessão expirou");
      const cv = await meuConvite();
      if (!cv) throw new Error("sem convite nesta conta");
      const uid = s.user.id;

      const urls = [];
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        if (!f.blob || f.remota) { urls.push(f.url); continue; }
        const caminho = `${uid}/${cv.id}-${i}-${Date.now()}.jpg`;
        const { error } = await SB.storage.from("fotos").upload(caminho, f.blob, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
        if (error) throw error;
        const url = SB.storage.from("fotos").getPublicUrl(caminho).data.publicUrl;
        f.url = url; f.remota = true;
        urls.push(url);
      }

      const dados = { ...convite, fotos: urls, editor };
      const { error } = await SB.from("convites").update({
        slug: convite.slug, modelo: convite.modelo, dados, publicado: true, data_evento: convite.data.slice(0, 10),
      }).eq("id", cv.id);
      if (error) {
        if (error.code === "23505") { const e = new Error("slug em uso"); e.codigo = "slug"; throw e; }
        throw error;
      }

      // limpa fotos antigas que não estão mais no convite
      try {
        const { data: lista } = await SB.storage.from("fotos").list(uid, { limit: 100 });
        const manter = new Set(urls.map((u) => decodeURIComponent(u.split("/").pop())));
        const velhas = (lista || []).filter((o) => o.name.startsWith(cv.id) && !manter.has(o.name)).map((o) => `${uid}/${o.name}`);
        if (velhas.length) await SB.storage.from("fotos").remove(velhas);
      } catch (_) {}

      return { url: C.SITE + "/" + convite.slug };
    },

    async confirmacoes() {
      const cv = await meuConvite();
      if (!cv) return { convite: null, lista: [] };
      const { data, error } = await SB.from("confirmacoes").select("id, criado_em, nome, vai, pessoas, recado")
        .eq("convite_id", cv.id).order("criado_em", { ascending: false }).limit(1000);
      if (error) throw error;
      return { convite: cv, lista: data };
    },
    async apagarConfirmacao(id) {
      const { error } = await SB.from("confirmacoes").delete().eq("id", id);
      if (error) throw error;
    },
  };

  /* ---------- sem login ---------- */
  window.chamarFuncao = async function (nome, corpo, comToken) {
    const headers = { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY };
    if (comToken) { const s = await sessao(); if (s) headers.Authorization = "Bearer " + s.access_token; }
    const r = await fetch(fn(nome), { method: "POST", headers, body: JSON.stringify(corpo || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.erro || j.mensagem || "erro " + r.status); e.resposta = j; throw e; }
    return j;
  };
})();
