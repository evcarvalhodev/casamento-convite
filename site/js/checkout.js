// Checkout em tela cheia, por cima da página de vendas — mesma estrutura do
// CheckoutModal do ViralFlow (Compra Segura › resumo › bumps › PIX/Cartão › garantia),
// nas cores do Pode Abrir.
//
// Uso: qualquer <a data-checkout> abre. Ou chamar abrirCheckout({ aoFechar }).
// Carrega o SDK do Mercado Pago e o Supabase só quando abre, pra não pesar a página de vendas.
(function () {
  const CSS = `
.ck { position: fixed; inset: 0; z-index: 1000; overflow-y: auto; -webkit-overflow-scrolling: touch; background: #f9fafb; color: #111827;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 15px; line-height: 1.45; }
.ck * { box-sizing: border-box; margin: 0; padding: 0; }
.ck [hidden] { display: none !important; }
.ck:focus { outline: none; }
.ck :focus-visible { outline: 2px solid #9ca3af; outline-offset: 2px; }
.ck-top { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid #e5e7eb;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ck-seg { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #374151; }
.ck-seg svg { width: 17px; height: 17px; color: #16a34a; }
.ck-passos { display: none; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
@media (min-width: 640px) { .ck-passos { display: flex; } }
.ck-passos span { color: #9ca3af; display: flex; align-items: center; gap: 4px; }
.ck-passos .feito { color: #16a34a; }
.ck-passos .atual { color: #111827; font-weight: 700; }
.ck-passos i { color: #d1d5db; font-style: normal; }
.ck-passos svg { width: 14px; height: 14px; }
.ck-x { background: none; border: 0; color: #9ca3af; cursor: pointer; padding: 6px; display: grid; place-items: center; border-radius: 8px; }
.ck-x svg { width: 22px; height: 22px; }
.ck-col { max-width: 460px; margin: 0 auto; padding: 20px 16px calc(56px + env(safe-area-inset-bottom)); display: grid; gap: 14px; }
.ck-card { background: #fff; border: 1px solid #f3f4f6; border-radius: 18px; box-shadow: 0 1px 2px rgba(0,0,0,.04); padding: 18px; }
.ck-rot { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #9ca3af; margin-bottom: 12px; }

.ck-prod { display: flex; gap: 12px; align-items: center; }
.ck-thumb { width: 58px; height: 58px; border-radius: 14px; flex: none; position: relative; overflow: hidden;
  background: linear-gradient(160deg, #efe4cf, #e2d2b3); }
.ck-thumb::before { content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom right, transparent 49%, #c9b48d 50%, transparent 51%) left / 50% 100% no-repeat,
  linear-gradient(to bottom left, transparent 49%, #c9b48d 50%, transparent 51%) right / 50% 100% no-repeat; opacity: .8; }
.ck-thumb::after { content: ""; position: absolute; width: 18px; height: 18px; border-radius: 50%; left: 50%; top: 50%; transform: translate(-50%, -20%);
  background: radial-gradient(circle at 35% 30%, #a84455, #6e1c28); box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.ck-prod b { display: block; font-size: 16px; font-weight: 800; }
.ck-prod small { color: #6b7280; font-size: 12.5px; }
.ck-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.ck-tags span { font-size: 10.5px; font-weight: 600; color: #374151; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 999px; padding: 2px 8px; }
.ck-qtd { font-weight: 800; flex: none; }
.ck-linhas { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f3f4f6; display: grid; gap: 6px; }
.ck-linha { display: flex; justify-content: space-between; font-size: 14px; color: #6b7280; }
.ck-linha.padrinhos { color: #d97706; }
.ck-linha.pix { color: #059669; }
.ck-total { display: flex; justify-content: space-between; font-size: 17px; font-weight: 800; color: #111827; padding-top: 8px; border-top: 1px solid #f3f4f6; }

.ck-bump { cursor: pointer; border-radius: 18px; border: 2px dashed; padding: 16px; background: #fff; transition: border-color .15s, background .15s; display: flex; gap: 12px; align-items: flex-start; text-align: left; width: 100%; font: inherit; color: inherit; }
.ck-bump .cx { width: 21px; height: 21px; border-radius: 6px; border: 2px solid #d1d5db; flex: none; margin-top: 1px; display: grid; place-items: center; background: #fff; }
.ck-bump .cx svg { width: 13px; height: 13px; color: #fff; opacity: 0; }
.ck-bump.on .cx svg { opacity: 1; }
.ck-bump.padrinhos { border-color: #fcd34d; }
.ck-bump.padrinhos.on { border-style: solid; border-color: #f59e0b; background: #fffbeb; }
.ck-bump.padrinhos.on .cx { background: #f59e0b; border-color: #f59e0b; }
.ck-bump.pix { border-color: #6ee7b7; }
.ck-bump.pix.on { border-style: solid; border-color: #10b981; background: #ecfdf5; }
.ck-bump.pix.on .cx { background: #10b981; border-color: #10b981; }
.ck-bump .selo { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; border-radius: 999px; padding: 2px 8px; }
.ck-bump.padrinhos .selo { color: #b45309; background: #fef3c7; }
.ck-bump.pix .selo { color: #047857; background: #d1fae5; }
.ck-bump .preco { font-size: 14px; font-weight: 800; margin-left: 6px; }
.ck-bump.padrinhos .preco { color: #b45309; }
.ck-bump.pix .preco { color: #047857; }
.ck-bump h4 { font-size: 14.5px; font-weight: 800; margin-top: 6px; display: flex; align-items: center; gap: 6px; }
.ck-bump h4 svg { width: 16px; height: 16px; flex: none; }
.ck-bump.padrinhos h4 svg { color: #f59e0b; }
.ck-bump.pix h4 svg { color: #10b981; }
.ck-bump p { font-size: 12.5px; color: #6b7280; margin-top: 4px; }
.ck-bump ul { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; margin-top: 8px; }
.ck-bump li { font-size: 12px; color: #4b5563; display: flex; gap: 5px; align-items: center; }
.ck-bump li::before { content: "✓"; font-weight: 800; }
.ck-bump.padrinhos li::before { color: #f59e0b; }
.ck-bump.pix li::before { color: #10b981; }
.ck-bump .fino { font-size: 10.5px; color: #9ca3af; margin-top: 8px; }

.ck-abas { display: flex; gap: 4px; background: #f3f4f6; border-radius: 12px; padding: 4px; margin-bottom: 16px; }
.ck-abas button { flex: 1; border: 0; background: none; font-family: inherit; font-weight: 700; font-size: 14px; color: #6b7280; padding: 10px; border-radius: 9px; cursor: pointer; }
.ck-abas button.on { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.ck-campo { display: grid; gap: 6px; margin-bottom: 14px; }
.ck-campo label { font-size: 14px; font-weight: 500; color: #374151; }
.ck-campo label span { color: #9ca3af; font-weight: 400; }
.ck-campo label em { color: #e05a4f; font-style: normal; }
.ck-campo input { width: 100%; font: inherit; font-size: 16px; color: #111827; background: #fff; border: 1px solid #d1d5db; border-radius: 12px; padding: 13px 14px; min-height: 50px; outline: none; -webkit-appearance: none; }
.ck-campo input:focus { border-color: #6b7280; box-shadow: 0 0 0 3px rgba(107, 114, 128, .15); }
.ck-campo small { font-size: 12px; color: #9ca3af; }
.ck-ok-lista { background: #ecfdf3; color: #15803d; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; display: grid; gap: 3px; margin-bottom: 14px; }
.ck-ok-lista p::before { content: "✓ "; font-weight: 800; }
.ck-parcela { display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb; background: #f9fafb; color: #374151; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; font-weight: 700; margin-bottom: 14px; }
.ck-parcela svg { width: 17px; height: 17px; }
.ck-pagar { width: 100%; border: 0; cursor: pointer; color: #fff; font-family: inherit; font-weight: 800; font-size: 15.5px; padding: 17px; border-radius: 12px; min-height: 56px;
  background: linear-gradient(135deg, #16a34a, #15803d); display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform .1s; }
.ck-pagar:active { transform: scale(.98); }
.ck-pagar:disabled { opacity: .6; }
.ck-erro { display: flex; gap: 8px; align-items: flex-start; color: #b42318; background: #fef3f2; border: 1px solid #fecdca; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; margin-top: 12px; }
.ck-girando { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: ck-gira .7s linear infinite; flex: none; }
@keyframes ck-gira { to { transform: rotate(360deg); } }
.ck-carregando { display: grid; place-items: center; gap: 10px; padding: 36px 0; color: #6b7280; font-size: 14px; }
.ck-carregando .ck-girando { width: 28px; height: 28px; color: #6b7280; }
#ck-brick { min-height: 60px; }

.ck-garantia { display: flex; gap: 8px; align-items: center; justify-content: center; text-align: center; color: #15803d; background: #ecfdf3; border: 1px solid #bbf0d0; border-radius: 14px; padding: 11px 14px; font-size: 12.5px; }
.ck-garantia svg { width: 17px; height: 17px; flex: none; }
.ck-rodape { text-align: center; font-size: 11.5px; color: #9ca3af; }

.ck-qr { display: grid; justify-items: center; gap: 12px; text-align: center; }
.ck-qr h3 { font-size: 17px; font-weight: 800; }
.ck-qr > p { font-size: 13px; color: #6b7280; }
.ck-qr img { width: 200px; height: 200px; border: 1px solid #e5e7eb; border-radius: 14px; padding: 8px; background: #fff; }
.ck-copiar { width: 100%; display: flex; gap: 8px; align-items: center; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; cursor: pointer; font: inherit; color: #4b5563; text-align: left; }
.ck-copiar code { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ck-copiar b { font-size: 13px; color: #111827; flex: none; }
.ck-esperando { width: 100%; display: flex; gap: 8px; align-items: center; justify-content: center; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 10px; font-size: 12.5px; font-weight: 600; }
.ck-ja { background: none; border: 0; color: #4b5563; text-decoration: underline; text-underline-offset: 3px; font-family: inherit; font-weight: 600; font-size: 13px; cursor: pointer; }
.ck-aprovado { text-align: center; display: grid; justify-items: center; gap: 8px; padding: 36px 18px; }
.ck-aprovado .v { width: 64px; height: 64px; border-radius: 50%; background: #ecfdf3; color: #16a34a; display: grid; place-items: center; }
.ck-aprovado .v svg { width: 34px; height: 34px; }
.ck-aprovado h3 { font-size: 21px; font-weight: 800; margin-top: 6px; }
.ck-aprovado p { color: #6b7280; font-size: 14.5px; max-width: 34ch; }
.ck-aprovado a { color: #111827; font-weight: 700; }
@media (prefers-reduced-motion: reduce) { .ck-girando { animation-duration: 2s; } }
`;

  const I = {
    escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/></svg>',
    certo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    certoCirculo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    cartao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    envelope: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    presente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8S10 3 7.5 4 9 8 12 8zM12 8s2-5 4.5-4S15 8 12 8z"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  };

  const brl = (v) => "R$" + v.toFixed(2).replace(".", ",");
  const dig = (v) => String(v || "").replace(/\D/g, "");
  const mascaraZap = (v) => { const d = dig(v).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim());
  const zapOk = (v) => { const d = dig(v); return d.length === 10 || d.length === 11; };

  const carregado = {};
  function script(src) {
    return carregado[src] ||= new Promise((ok, erro) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
  }
  async function dependencias() {
    await script("https://sdk.mercadopago.com/js/v2");
    if (!window.CONFIG) await script("/js/config.js");
    if (!window.supabase) await script("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js");
    if (!window.chamarFuncao) await script("/js/api.js");
  }

  let el = null, estado = null, brick = null, poll = null, opcoes = {};

  function montarTela() {
    if (!document.getElementById("ck-css")) { const s = document.createElement("style"); s.id = "ck-css"; s.textContent = CSS; document.head.appendChild(s); }
    el = document.createElement("div");
    el.className = "ck";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Finalizar compra");
    el.innerHTML = `
      <header class="ck-top">
        <div class="ck-seg">${I.escudo}Compra Segura</div>
        <nav class="ck-passos" aria-label="Etapas"><span class="feito">${I.certoCirculo}Produto</span><i>›</i><span class="atual" id="ck-p2">Pagamento</span><i>›</i><span id="ck-p3">Finalização</span></nav>
        <button class="ck-x" type="button" id="ck-fechar" aria-label="Fechar">${I.x}</button>
      </header>
      <div class="ck-col">
        <div id="ck-form" style="display:grid;gap:14px">
          <div class="ck-card">
            <p class="ck-rot">Resumo do pedido</p>
            <div class="ck-prod"><div class="ck-thumb" aria-hidden="true"></div>
              <div style="flex:1;min-width:0"><b>Pode Abrir</b><small>Convite de casamento interativo · acesso imediato</small>
                <div class="ck-tags"><span>Envelope que abre</span><span>3 modelos</span><span>Confirmação de presença</span><span>Garantia 7 dias</span></div></div>
              <span class="ck-qtd">x1</span></div>
            <div class="ck-linhas">
              <div class="ck-linha"><span>Convite interativo</span><span id="ck-v-base"></span></div>
              <div class="ck-linha padrinhos" id="ck-l-padrinhos" hidden><span>Convite dos Padrinhos</span><span id="ck-v-padrinhos"></span></div>
              <div class="ck-linha pix" id="ck-l-pix" hidden><span>Presentes no Pix</span><span id="ck-v-pix"></span></div>
              <div class="ck-total"><span>Total</span><span id="ck-total"></span></div>
            </div>
          </div>

          <button type="button" class="ck-bump padrinhos" data-bump="padrinhos" aria-pressed="false">
            <span class="cx">${I.certo}</span>
            <span style="flex:1;min-width:0;display:block">
              <span class="selo">Oferta especial</span><span class="preco" id="ck-b-padrinhos"></span>
              <h4>${I.envelope}Adicionar Convite dos Padrinhos</h4>
              <p>O mesmo envelope, com a pergunta "Quer ser nosso padrinho?". Cada padrinho recebe o seu e responde com um toque.</p>
              <ul><li>Nome no envelope</li><li>Resposta no painel</li><li>Mesmo modelo do convite</li><li>Padrinhos ilimitados</li></ul>
              <p class="fino">Pagamento único · Só nesta tela</p>
            </span>
          </button>

          <button type="button" class="ck-bump pix" data-bump="pix" aria-pressed="false">
            <span class="cx">${I.certo}</span>
            <span style="flex:1;min-width:0;display:block">
              <span class="selo">Oferta especial</span><span class="preco" id="ck-b-pix"></span>
              <h4>${I.presente}Adicionar Presentes no Pix</h4>
              <p>Uma seção no convite com a chave Pix de vocês e o QR Code. O dinheiro cai direto na sua conta.</p>
              <ul><li>Sem taxa nenhuma</li><li>QR Code pronto</li><li>Cai na hora</li><li>Sem cadastro em site</li></ul>
              <p class="fino">Pagamento único · Só nesta tela</p>
            </span>
          </button>

          <div class="ck-card">
            <p class="ck-rot">Pagamento</p>
            <div class="ck-abas" role="tablist"><button type="button" role="tab" data-aba="pix" class="on">PIX</button><button type="button" role="tab" data-aba="cartao">Cartão de crédito</button></div>

            <div id="ck-aba-pix">
              <div class="ck-campo"><label for="ck-email">Seu e-mail <em>*</em></label><input id="ck-email" type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com"><small>Seu acesso será enviado para este e-mail</small></div>
              <div class="ck-campo"><label for="ck-zap">Seu WhatsApp <span>(opcional)</span></label><input id="ck-zap" type="tel" inputmode="numeric" autocomplete="tel" placeholder="(11) 99999-9999"><small>Só usamos se o e-mail não chegar</small></div>
              <div class="ck-ok-lista"><p>Após o pagamento, permaneça nesta página</p><p>Enviaremos o acesso para o seu e-mail</p><p>Verifique também a caixa de spam</p></div>
              <button class="ck-pagar" type="button" id="ck-pagar-pix"></button>
            </div>

            <div id="ck-aba-cartao" hidden>
              <div class="ck-ok-lista"><p>Após a compra, permaneça nesta página</p><p>Enviaremos o acesso para o seu e-mail</p><p>Verifique também a caixa de spam</p></div>
              <div class="ck-parcela">${I.cartao}Parcele em até 12x no cartão</div>
              <div class="ck-campo"><label for="ck-zap2">Seu WhatsApp <span>(opcional)</span></label><input id="ck-zap2" type="tel" inputmode="numeric" autocomplete="tel" placeholder="(11) 99999-9999"></div>
              <div id="ck-brick"></div>
              <div class="ck-carregando" id="ck-processando" hidden><span class="ck-girando"></span>Processando pagamento…</div>
            </div>

            <div class="ck-erro" id="ck-erro" hidden>${I.alerta}<span></span></div>
          </div>

          <div class="ck-garantia">${I.escudo}<span><strong>Garantia de 7 dias</strong>: não gostou, devolvemos 100% do valor</span></div>
          <p class="ck-rodape">Pagamento 100% seguro via Mercado Pago · Pagamento único</p>
        </div>

        <div id="ck-tela-pix" hidden style="display:grid;gap:14px">
          <div class="ck-card"><div class="ck-prod"><div class="ck-thumb" aria-hidden="true" style="width:46px;height:46px"></div><div style="flex:1;min-width:0"><b style="font-size:14.5px" id="ck-pix-nome"></b><small>Acesso imediato</small></div><b id="ck-pix-valor"></b></div></div>
          <div class="ck-card ck-qr">
            <h3>Pague via PIX</h3>
            <p>Escaneie o QR Code ou copie o código abaixo</p>
            <img id="ck-qr-img" alt="QR Code do Pix">
            <button type="button" class="ck-copiar" id="ck-copiar"><code id="ck-qr-code"></code><b id="ck-copiar-txt">Copiar</b></button>
            <div class="ck-esperando"><span class="ck-girando"></span>Aguardando confirmação do pagamento…</div>
            <button type="button" class="ck-ja" id="ck-ja">Já realizei o pagamento →</button>
          </div>
        </div>

        <div id="ck-tela-ok" hidden>
          <div class="ck-card ck-aprovado">
            <div class="v">${I.certo}</div>
            <h3>Pagamento aprovado!</h3>
            <p>Enviamos o link para montar o convite no e-mail <b id="ck-ok-email"></b>. Abra no celular.</p>
            <p style="font-size:13px">Não chegou em 2 minutos? Olhe o spam ou <a href="/entrar">peça outro link aqui</a>.</p>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);

    const $ = (s) => el.querySelector(s);
    $("#ck-fechar").onclick = fechar;
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    el.querySelectorAll("[data-bump]").forEach((b) => b.onclick = () => {
      estado.itens[b.dataset.bump] = !estado.itens[b.dataset.bump];
      pintar();
      if (estado.aba === "cartao") montarCartao();
    });
    el.querySelectorAll("[data-aba]").forEach((b) => b.onclick = () => trocarAba(b.dataset.aba));
    for (const id of ["#ck-zap", "#ck-zap2"]) $(id).addEventListener("input", (e) => { e.target.value = mascaraZap(e.target.value); erro(""); });
    $("#ck-email").addEventListener("input", () => erro(""));
    $("#ck-pagar-pix").onclick = pagarPix;
    $("#ck-copiar").onclick = copiarPix;
    $("#ck-ja").onclick = () => { $("#ck-ja").textContent = "Assim que o banco confirmar, esta tela muda sozinha e o acesso chega no seu e-mail."; };
  }

  const P = () => window.CONFIG.PRECOS;
  const total = () => P().base + (estado.itens.padrinhos ? P().padrinhos : 0) + (estado.itens.pix ? P().pix : 0);

  function pintar() {
    const $ = (s) => el.querySelector(s);
    $("#ck-v-base").textContent = brl(P().base);
    $("#ck-v-padrinhos").textContent = brl(P().padrinhos);
    $("#ck-v-pix").textContent = brl(P().pix);
    $("#ck-b-padrinhos").textContent = "+ " + brl(P().padrinhos);
    $("#ck-b-pix").textContent = "+ " + brl(P().pix);
    $("#ck-l-padrinhos").hidden = !estado.itens.padrinhos;
    $("#ck-l-pix").hidden = !estado.itens.pix;
    $("#ck-total").textContent = brl(total());
    el.querySelectorAll("[data-bump]").forEach((b) => { const on = estado.itens[b.dataset.bump]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    if (!estado.processando) $("#ck-pagar-pix").textContent = `Finalizar Pedido — ${brl(total())}`;
  }
  function erro(msg) {
    const box = el.querySelector("#ck-erro");
    box.hidden = !msg; box.querySelector("span").textContent = msg || "";
  }
  function trocarAba(aba) {
    estado.aba = aba; erro("");
    el.querySelectorAll("[data-aba]").forEach((b) => b.classList.toggle("on", b.dataset.aba === aba));
    el.querySelector("#ck-aba-pix").hidden = aba !== "pix";
    el.querySelector("#ck-aba-cartao").hidden = aba !== "cartao";
    if (aba === "cartao") montarCartao();
  }

  async function montarCartao() {
    const box = el.querySelector("#ck-brick");
    if (brick) { try { await brick.unmount(); } catch (_) {} brick = null; }
    box.innerHTML = '<div class="ck-carregando"><span class="ck-girando"></span>Carregando…</div>';
    try {
      const mp = new MercadoPago(window.CONFIG.MP_PUBLIC_KEY, { locale: "pt-BR" });
      box.innerHTML = "";
      brick = await mp.bricks().create("cardPayment", "ck-brick", {
        initialization: { amount: total() },
        customization: {
          paymentMethods: { maxInstallments: 12 },
          visual: { style: { theme: "default", customVariables: { borderRadiusMedium: "12px", borderRadiusLarge: "14px" } } },
        },
        callbacks: {
          onReady: () => {},
          onError: (e) => { console.warn("MP cartão:", e); },
          onSubmit: (formData) => pagarCartao(formData),
        },
      });
    } catch (e) {
      console.error(e);
      box.innerHTML = "";
      erro("Não conseguimos carregar o pagamento com cartão. Recarregue a página ou pague com Pix.");
    }
  }

  async function cobrar(comprador, pagamento) {
    if (!window.chamarFuncao) throw new Error("O pagamento ainda não está configurado neste endereço (teste local).");
    return chamarFuncao("criar-pagamento", { comprador, itens: { padrinhos: estado.itens.padrinhos, pix: estado.itens.pix }, pagamento });
  }

  async function pagarPix() {
    const email = el.querySelector("#ck-email").value.trim().toLowerCase();
    const zap = el.querySelector("#ck-zap").value;
    if (!emailOk(email)) return erro("E-mail inválido. Verifique e tente novamente.");
    if (zap && !zapOk(zap)) return erro("WhatsApp inválido. Coloque DDD + número, ex.: (11) 99999-9999.");
    erro("");
    const btn = el.querySelector("#ck-pagar-pix");
    estado.processando = true; btn.disabled = true; btn.innerHTML = '<span class="ck-girando"></span>Gerando PIX…';
    estado.email = email;
    try {
      const r = await cobrar({ email, whatsapp: dig(zap) }, { payment_method_id: "pix" });
      estado.pedidoId = r.pedido_id;
      if (r.status === "approved") return aprovado();
      if (!r.pix) throw new Error("O Pix não foi gerado. Tente de novo.");
      mostrarPix(r);
    } catch (e) {
      erro(e.message || "Erro inesperado. Tente novamente.");
    } finally {
      estado.processando = false; btn.disabled = false; pintar();
    }
  }

  async function pagarCartao(formData) {
    const email = String((formData.payer && formData.payer.email) || "").trim().toLowerCase();
    const zap = el.querySelector("#ck-zap2").value;
    if (!emailOk(email)) { erro("E-mail inválido. Verifique o campo e-mail e tente novamente."); return; }
    if (zap && !zapOk(zap)) { erro("WhatsApp inválido. Coloque DDD + número."); return; }
    erro("");
    estado.email = email;
    el.querySelector("#ck-brick").hidden = true;
    el.querySelector("#ck-processando").hidden = false;
    try {
      const r = await cobrar({ email, whatsapp: dig(zap) }, formData);
      estado.pedidoId = r.pedido_id;
      if (r.status === "approved") return aprovado();
      if (r.status === "in_process" || r.status === "pending") return erro("Pagamento em análise pelo banco. O acesso chega no seu e-mail assim que for aprovado.");
      erro("Pagamento não aprovado. Confira os dados do cartão ou pague com Pix.");
    } catch (e) {
      erro(e.message || "Erro inesperado. Tente novamente.");
    } finally {
      el.querySelector("#ck-brick").hidden = false;
      el.querySelector("#ck-processando").hidden = true;
    }
  }

  function mostrarPix(r) {
    const $ = (s) => el.querySelector(s);
    const extras = [estado.itens.padrinhos && "Padrinhos", estado.itens.pix && "Pix"].filter(Boolean);
    $("#ck-pix-nome").textContent = "Pode Abrir" + (extras.length ? " + " + extras.join(" + ") : "");
    $("#ck-pix-valor").textContent = brl(total());
    $("#ck-qr-img").src = "data:image/png;base64," + r.pix.qr_base64;
    $("#ck-qr-code").textContent = r.pix.copia_e_cola;
    estado.pix = r.pix.copia_e_cola;
    $("#ck-form").hidden = true; $("#ck-tela-pix").hidden = false;
    el.scrollTo({ top: 0 });
    esperar(r.pedido_id);
  }
  async function copiarPix() {
    const t = el.querySelector("#ck-copiar-txt");
    try { await navigator.clipboard.writeText(estado.pix); t.textContent = "Copiado!"; }
    catch (_) { const r = document.createRange(); r.selectNodeContents(el.querySelector("#ck-qr-code")); getSelection().removeAllRanges(); getSelection().addRange(r); t.textContent = "Selecionado"; }
    setTimeout(() => (t.textContent = "Copiar"), 2000);
  }
  // Pergunta ao banco a cada 5s se o Pix caiu (quem muda o status é o mp-webhook).
  function esperar(pedidoId) {
    clearInterval(poll);
    const fim = Date.now() + 32 * 60 * 1000;
    poll = setInterval(async () => {
      if (Date.now() > fim) return clearInterval(poll);
      try { const { data } = await SB.rpc("status_pedido", { p_id: pedidoId }); if (data === "aprovado") aprovado(); } catch (_) {}
    }, 5000);
  }

  function aprovado() {
    clearInterval(poll);
    // if (window.fbq) fbq("track", "Purchase", ...) — disparar ANTES de sair da página
    // Igual ao ViralFlow: vai pro /parabens criar a senha e entrar direto.
    if (estado.pedidoId) { location.href = "/parabens?pedido=" + encodeURIComponent(estado.pedidoId); return; }
    const $ = (s) => el.querySelector(s);
    $("#ck-ok-email").textContent = estado.email || "informado";
    $("#ck-form").hidden = true; $("#ck-tela-pix").hidden = true; $("#ck-tela-ok").hidden = false;
    $("#ck-p2").className = "feito"; $("#ck-p3").className = "atual";
    el.scrollTo({ top: 0 });
    // if (window.fbq) fbq("track", "Purchase", { value: total(), currency: "BRL" });
  }

  async function abrir(opts) {
    opcoes = opts || {};
    if (el) return;
    estado = { itens: { padrinhos: false, pix: false }, aba: "pix", processando: false, email: "" };
    document.documentElement.style.overflow = "hidden";
    try { await dependencias(); } catch (e) { console.error("checkout: falhou ao carregar", e); }
    montarTela();
    pintar();
    el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true });
    // if (window.fbq) fbq("track", "InitiateCheckout", { value: total(), currency: "BRL" });
  }
  async function fechar() {
    clearInterval(poll);
    if (brick) { try { await brick.unmount(); } catch (_) {} brick = null; }
    if (el) { el.remove(); el = null; }
    document.documentElement.style.overflow = "";
    if (opcoes.aoFechar) opcoes.aoFechar();
  }

  window.abrirCheckout = abrir;
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-checkout]");
    if (!a) return;
    e.preventDefault();
    abrir();
  });
})();
