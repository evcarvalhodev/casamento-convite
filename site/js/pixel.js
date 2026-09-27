// Pixel da Meta: conjunto de dados CONVITE_CASAMENTO (BM do ViralFlow).
// Só nas páginas de venda (vendas, checkout, /parabens). NÃO vai no convite:
// convidado abrindo convite não é comprador e sujaria o público de otimização.
(function () {
  const ID = "1445645484133103";
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  fbq("init", ID);
  fbq("track", "PageView");

  // pixel("Purchase", { value, currency }, { eventID, email })
  // eventID = id do pedido: se um dia a API de Conversões mandar a mesma compra
  // pelo servidor, a Meta junta as duas e não conta em dobro.
  window.pixel = function (evento, dados, opcoes) {
    try {
      opcoes = opcoes || {};
      if (opcoes.email) fbq("init", ID, { em: String(opcoes.email).trim().toLowerCase() });
      fbq("track", evento, dados || {}, opcoes.eventID ? { eventID: String(opcoes.eventID) } : undefined);
    } catch (_) {}
  };
})();
