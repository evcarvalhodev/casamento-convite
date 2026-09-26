// Convite pra instalar o Pode Abrir como aplicativo. Só no painel (quem já
// comprou e montou o convite). Mesma lógica do PWAInstallPrompt do ViralFlow:
//
//   Android/computador (Chrome/Edge) — o navegador dispara `beforeinstallprompt`;
//   guardamos o evento e o botão "Instalar" instala de verdade, com um toque.
//
//   iPhone/iPad — o Safari NÃO tem esse evento e não existe como instalar por
//   código. O convite é uma INSTRUÇÃO com seta. Caminho conferido em vários iPhones
//   no ViralFlow (20/08/2026): "…" no canto de baixo → Compartilhar → Ver Mais →
//   Adicionar à Tela de Início. Só no Safari (nos outros o passo a passo não leva
//   a lugar nenhum).
//
//   O iOS trata o app instalado como outro site: o login do Safari não vai junto.
//   O texto avisa, pra não virar "sumiu minha conta".
(function () {
  const DISPENSADO = "podeabrir_instalar_dispensado";
  const VEZES = "podeabrir_instalar_vezes";
  const DIAS_SILENCIO = 7, MAX_RECUSAS = 3;

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

  const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ehSafari = () => /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  const ler = (k) => { try { return Number(localStorage.getItem(k) || 0); } catch (_) { return 0; } };
  const naoPerturbe = () => ler(VEZES) >= MAX_RECUSAS || (ler(DISPENSADO) && Date.now() - ler(DISPENSADO) < DIAS_SILENCIO * 864e5);

  const CSS = `
.inst { position: fixed; left: 50%; transform: translateX(-50%); bottom: 16px; z-index: 900; width: calc(100% - 32px); max-width: 400px;
  font-family: "Manrope", system-ui, -apple-system, sans-serif; animation: inst-sobe .35s ease; }
.inst.ios-aberto { bottom: max(env(safe-area-inset-bottom), 6px); }
@keyframes inst-sobe { from { transform: translate(-50%, 20px); opacity: 0; } }
.inst .caixa { background: #fffdf9; color: #1f1a14; border: 1px solid #e4dacb; border-radius: 18px; box-shadow: 0 20px 40px -12px rgba(40,28,12,.35); padding: 14px; }
.inst .topo { display: flex; align-items: center; gap: 12px; }
.inst img { width: 46px; height: 46px; border-radius: 12px; flex: none; }
.inst .txt { flex: 1; min-width: 0; }
.inst b { display: block; font-size: 15px; }
.inst small { display: block; font-size: 12px; color: #6f6456; line-height: 1.35; }
.inst .ir { flex: none; background: #1f1a14; color: #fff; border: 0; border-radius: 12px; padding: 10px 14px; font-family: inherit; font-weight: 800; font-size: 13px; cursor: pointer; }
.inst .x { flex: none; background: none; border: 0; color: #9c8f7e; font-size: 22px; line-height: 1; padding: 4px 6px; cursor: pointer; }
.inst ol { list-style: none; margin: 12px 0 0; padding: 12px 0 0; border-top: 1px solid #efe7da; display: grid; gap: 8px; }
.inst li { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: #6f6456; }
.inst li span { width: 22px; height: 22px; border-radius: 7px; background: #f3e8d4; color: #1f1a14; font-weight: 800; font-size: 11px; display: grid; place-items: center; flex: none; }
.inst li strong { color: #1f1a14; }
.inst .aviso { font-size: 11.5px; color: #9c8f7e; margin-top: 10px; line-height: 1.4; }
.inst .seta { display: flex; flex-direction: column; align-items: flex-end; padding-right: 2.75rem; pointer-events: none; color: #9a7a46; }
.inst .seta svg { width: 28px; height: 28px; animation: inst-pula 1s ease-in-out infinite; filter: drop-shadow(0 2px 6px rgba(0,0,0,.35)); }
.inst .seta em { font-style: normal; font-size: 11px; font-weight: 700; margin-top: -4px; }
@keyframes inst-pula { 50% { transform: translateY(6px); } }`;

  let prompt = null, el = null;

  function mostrar(modoIOS) {
    if (el || instalado() || naoPerturbe()) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement("div");
    el.className = "inst";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Instalar o Pode Abrir");
    el.innerHTML = `<div class="caixa">
      <div class="topo"><img src="/app/icone-192.png" alt="">
        <div class="txt"><b>Instale o Pode Abrir</b><small>${modoIOS ? "Veja quem confirmou num toque, em tela cheia" : "Veja quem confirmou num toque, direto da tela inicial"}</small></div>
        <button class="ir" type="button">Instalar</button>
        <button class="x" type="button" aria-label="Fechar">×</button></div>
      <div class="passos" hidden></div></div>`;
    document.body.appendChild(el);
    el.querySelector(".x").onclick = dispensar;
    el.querySelector(".ir").onclick = modoIOS ? passoAPasso : instalar;
  }

  function passoAPasso() {
    el.classList.add("ios-aberto");
    el.querySelector(".ir").remove();
    const p = el.querySelector(".passos");
    p.hidden = false;
    p.innerHTML = `<ol>
      <li><span>1</span>Toque nos <strong>•••</strong> no canto de baixo</li>
      <li><span>2</span>Escolha <strong>Compartilhar</strong></li>
      <li><span>3</span>Role até o fim ou toque em <strong>Ver Mais</strong></li>
      <li><span>4</span>Toque em <strong>Adicionar à Tela de Início</strong></li></ol>
      <p class="aviso">No aplicativo, entre uma vez com o seu e-mail e senha: o iPhone não leva o login do Safari junto.</p>`;
    // A seta aponta pro "…" do Safari, no canto inferior direito (~85px da borda).
    const seta = document.createElement("div");
    seta.className = "seta";
    seta.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg><em>toque aqui</em>';
    el.appendChild(seta);
  }

  async function instalar() {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    prompt = null;
    if (outcome === "accepted") fechar();
  }
  function dispensar() {
    try { localStorage.setItem(DISPENSADO, String(Date.now())); localStorage.setItem(VEZES, String(ler(VEZES) + 1)); } catch (_) {}
    fechar();
  }
  function fechar() { if (el) { el.remove(); el = null; } }

  // O painel chama isto depois de confirmar que a pessoa tem convite publicado.
  window.oferecerInstalar = function () {
    if (instalado() || naoPerturbe()) return;
    if (ehIOS()) { if (ehSafari()) mostrar(true); return; }
    if (prompt) mostrar(false);
    else window.__querInstalar = true; // o evento ainda não chegou: mostra quando chegar
  };
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt = e;
    if (window.__querInstalar) mostrar(false);
  });
  addEventListener("appinstalled", fechar);
})();
