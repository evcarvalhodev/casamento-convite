// Trilha dos criativos, gerada no navegador (Web Audio): música suave de
// caixinha de música + fundo de piano/cordas, e efeitos sincronizados.
// Tudo é agendado por tempo (em segundos), então a mesma lista de sons toca
// ao vivo (AudioContext) ou é renderizada pra arquivo (OfflineAudioContext)
// na exportação do vídeo.
const Som = (() => {
  const ruidos = new WeakMap();
  function ruido(ctx) {
    if (!ruidos.has(ctx)) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ruidos.set(ctx, b);
    }
    return ruidos.get(ctx);
  }
  function impulso(ctx, dur, queda) {
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, queda);
    }
    return b;
  }

  function criar(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = .01; comp.release.value = .25;
    const master = ctx.createGain(); master.gain.value = 1.55;
    // limitador no fim: segura os impactos sem estourar
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .08;
    const fim = ctx.createGain(); fim.gain.value = .88;
    master.connect(comp).connect(lim).connect(fim).connect(ctx.destination);
    const rev = ctx.createConvolver(); rev.buffer = impulso(ctx, 3, 2.4);
    const revVolta = ctx.createGain(); revVolta.gain.value = .5; rev.connect(revVolta).connect(master);
    const musica = ctx.createGain(); musica.gain.value = .6; musica.connect(master);
    const efeitos = ctx.createGain(); efeitos.gain.value = 1; efeitos.connect(master);
    return { ctx, master, rev, musica, efeitos };
  }

  // liga um nó na saída e manda um pouco pro reverb
  function saida(S, no, destino, reverb) {
    no.connect(destino);
    if (reverb) { const g = S.ctx.createGain(); g.gain.value = reverb; no.connect(g).connect(S.rev); }
  }
  function envelope(g, t, ataque, pico, queda) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pico, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
  }

  // ---------- instrumentos ----------
  function caixinha(S, t, f, vol = .1, destino = S.musica, reverb = .6) {
    const { ctx } = S, g = ctx.createGain();
    envelope(g, t, .004, vol, 1.6);
    [[1, 1], [2, .28], [3.01, .09], [4.2, .04]].forEach(([k, a]) => {
      const o = ctx.createOscillator(), ga = ctx.createGain();
      o.type = "sine"; o.frequency.value = f * k; ga.gain.value = a;
      o.connect(ga).connect(g); o.start(t); o.stop(t + 1.8);
    });
    saida(S, g, destino, reverb);
  }
  function piano(S, t, f, dur, vol = .05) {
    const { ctx } = S, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = .3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + .9);
    g.gain.setValueAtTime(vol, t + dur - .2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
    [-7, 0, 7].forEach(cents => {
      const o = ctx.createOscillator();
      o.type = "triangle"; o.frequency.value = f; o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.5);
    });
    lp.connect(g); saida(S, g, S.musica, .5);
  }
  function grave(S, t, f, dur, vol = .09) {
    const { ctx } = S, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + .4);
    g.gain.setValueAtTime(vol, t + dur - .3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + .6);
    o.connect(g); o.start(t); o.stop(t + dur + .7); saida(S, g, S.musica, .1);
  }

  // ---------- efeitos ----------
  function whoosh(S, t, dur = .7, vol = .35, de = 350, ate = 2600) {
    const { ctx } = S, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = ruido(ctx);
    bp.type = "bandpass"; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(de, t); bp.frequency.exponentialRampToValueAtTime(ate, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * .65);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g); src.start(t); src.stop(t + dur + .05);
    saida(S, g, S.efeitos, .25);
  }
  function toque(S, t) {
    const { ctx } = S, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(380, t + .05);
    envelope(g, t, .002, .28, .07);
    o.connect(g); o.start(t); o.stop(t + .1); saida(S, g, S.efeitos, .05);
  }
  function papel(S, t, dur = .45, vol = .22) {
    const { ctx } = S, src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = ruido(ctx); src.playbackRate.value = .8;
    hp.type = "highpass"; hp.frequency.value = 1700;
    envelope(g, t, .015, vol, dur);
    src.connect(hp).connect(g); src.start(t); src.stop(t + dur + .1); saida(S, g, S.efeitos, .15);
  }
  function baque(S, t, vol = .6) {
    const { ctx } = S, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .28);
    envelope(g, t, .004, vol, .32);
    o.connect(g); o.start(t); o.stop(t + .4); saida(S, g, S.efeitos, .1);
  }
  const PENTA = [1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186];
  function brilhos(S, t, n = 14, vol = .06, espalha = .05) {
    for (let i = 0; i < n; i++) {
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      caixinha(S, t + i * espalha + Math.random() * .03, f, vol * (1 - i / n * .5), S.efeitos, .9);
    }
  }
  function pop(S, t, f = 600, vol = .22) {
    const { ctx } = S, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + .06);
    envelope(g, t, .003, vol, .12);
    o.connect(g); o.start(t); o.stop(t + .2); saida(S, g, S.efeitos, .2);
  }
  function sino(S, t, f, vol = .18) {
    const { ctx } = S, g = ctx.createGain();
    envelope(g, t, .003, vol, 1.1);
    [[1, 1], [2.76, .35], [5.4, .12]].forEach(([k, a]) => {
      const o = ctx.createOscillator(), ga = ctx.createGain();
      o.frequency.value = f * k; ga.gain.value = a; o.connect(ga).connect(g); o.start(t); o.stop(t + 1.3);
    });
    saida(S, g, S.efeitos, .4);
  }
  // ---------- efeitos "satisfatórios" (em camadas) ----------
  function panear(S, no, pan) {
    if (!pan || !S.ctx.createStereoPanner) return no;
    const p = S.ctx.createStereoPanner(); p.pan.value = pan; no.connect(p); return p;
  }
  // clique tátil: estalo agudo curtinho + corpo grave
  function clique(S, t, vol = .5, pan = 0) {
    const { ctx } = S;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = ruido(ctx); bp.type = "bandpass"; bp.frequency.value = 4200; bp.Q.value = 2.5;
    envelope(g, t, .0008, vol * .9, .025);
    src.connect(bp).connect(g); src.start(t); src.stop(t + .05);
    const o = ctx.createOscillator(), g2 = ctx.createGain();
    o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(90, t + .06);
    envelope(g2, t, .001, vol * .8, .07);
    o.connect(g2); o.start(t); o.stop(t + .1);
    const mix = ctx.createGain(); g.connect(mix); g2.connect(mix);
    saida(S, panear(S, mix, pan), S.efeitos, .08);
  }
  // bolha: "bloop" que sobe de nota, redondo
  function bolha(S, t, f = 420, vol = .32, pan = 0) {
    const { ctx } = S, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f * .7, t); o.frequency.exponentialRampToValueAtTime(f * 1.9, t + .09);
    o2.type = "triangle"; o2.frequency.setValueAtTime(f * 1.4, t); o2.frequency.exponentialRampToValueAtTime(f * 3.8, t + .09);
    envelope(g, t, .004, vol, .16); g2.gain.value = .18;
    o.connect(g); o2.connect(g2).connect(g); o.start(t); o2.start(t); o.stop(t + .25); o2.stop(t + .25);
    clique(S, t, vol * .35, pan);
    saida(S, panear(S, g, pan), S.efeitos, .22);
  }
  // papel amassando: vários grãozinhos de ruído agudo
  function amassar(S, t, dur = .45, vol = .28) {
    const { ctx } = S, hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = "highpass"; hp.frequency.value = 2200; g.gain.value = vol;
    hp.connect(g); saida(S, g, S.efeitos, .12);
    const n = Math.round(dur * 70);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.pow(i / n, 1.4) * dur, src = ctx.createBufferSource(), gg = ctx.createGain();
      src.buffer = ruido(ctx); src.playbackRate.value = .6 + Math.random() * 1.2;
      const a = (.25 + Math.random() * .75) * (1 - i / n * .6);
      envelope(gg, tt, .0006, a, .008 + Math.random() * .025);
      src.connect(gg).connect(hp); src.start(tt, Math.random() * 1.5); src.stop(tt + .05);
    }
  }
  // estalo do lacre: estalo seco + baque
  function lacre(S, t) {
    clique(S, t, .7);
    const { ctx } = S, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = ruido(ctx); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = .8;
    envelope(g, t, .001, .45, .06);
    src.connect(bp).connect(g); src.start(t); src.stop(t + .1); saida(S, g, S.efeitos, .2);
    baque(S, t + .005, .5);
  }
  // subida de tensão (ruído que abre e sobe), termina no tempo t
  function subida(S, t, dur = .8, vol = .22) {
    const { ctx } = S, t0 = t - dur, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = ruido(ctx);
    bp.type = "bandpass"; bp.Q.value = .9;
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(6000, t);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t - .02); g.gain.linearRampToValueAtTime(0.0001, t);
    src.connect(bp).connect(g); src.start(t0); src.stop(t + .02); saida(S, g, S.efeitos, .3);
    const o = ctx.createOscillator(), go = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(220, t0); o.frequency.exponentialRampToValueAtTime(880, t);
    go.gain.setValueAtTime(0.0001, t0); go.gain.exponentialRampToValueAtTime(vol * .35, t - .02); go.gain.linearRampToValueAtTime(0.0001, t);
    o.connect(go); o.start(t0); o.stop(t + .02); saida(S, go, S.efeitos, .4);
  }
  // impacto grave e macio (o "boom" das viradas)
  function impacto(S, t, vol = .7) {
    const { ctx } = S, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + .6);
    envelope(g, t, .004, vol, .75);
    o.connect(g); o.start(t); o.stop(t + .9); saida(S, g, S.efeitos, .15);
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g2 = ctx.createGain();
    src.buffer = ruido(ctx); lp.type = "lowpass"; lp.frequency.value = 900;
    envelope(g2, t, .002, vol * .35, .35);
    src.connect(lp).connect(g2); src.start(t); src.stop(t + .4); saida(S, g2, S.efeitos, .35);
  }
  // tique afinado (sobe de nota a cada número)
  function tiqueNota(S, t, f, vol = .1) {
    const { ctx } = S, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f;
    envelope(g, t, .001, vol, .05);
    o.connect(g); o.start(t); o.stop(t + .08); saida(S, g, S.efeitos, .1);
  }

  function notificacao(S, t) { sino(S, t, 1318.5, .16); sino(S, t + .13, 1975.5, .14); }
  function tique(S, t, vol = .04) {
    const { ctx } = S, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = 2600;
    envelope(g, t, .001, vol, .018);
    o.connect(g); o.start(t); o.stop(t + .03); saida(S, g, S.efeitos, 0);
  }

  // ---------- música ----------
  // acordes (Hz) com duração em segundos; a caixinha entra quando o envelope abre
  function musica(S, t0, acordes, arpejoDesde, fim) {
    let t = t0;
    for (const [notas, dur] of acordes) {
      notas.forEach(f => piano(S, t, f, dur, .035));
      grave(S, t, notas[0] / 2, dur);
      const passo = .375, padrao = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let k = 0, ta = t; ta < t + dur - .01; k++, ta += passo) {
        if (ta < arpejoDesde || ta > fim - .6) continue;
        caixinha(S, ta, notas[padrao[k % padrao.length]] * 2, k % 4 === 0 ? .1 : .07);
      }
      t += dur;
    }
    // termina com fade
    S.musica.gain.setValueAtTime(S.musica.gain.value, t0 + fim - 1.2);
    S.musica.gain.linearRampToValueAtTime(0.0001, t0 + fim);
  }

  const C = { Cmaj7: [261.63, 329.63, 392, 493.88], Am7: [220, 261.63, 329.63, 392], Fmaj7: [174.61, 220, 261.63, 329.63],
    G6: [196, 246.94, 293.66, 329.63], Cadd9: [261.63, 293.66, 329.63, 392] };

  return { criar, whoosh, toque, papel, baque, brilhos, pop, sino, notificacao, tique, musica, C,
    clique, bolha, amassar, lacre, subida, impacto, tiqueNota };
})();

// agenda uma trilha (lista de {t, f}) num contexto; devolve o grafo
function agendarTrilha(ctx, trilha, t0) {
  const S = Som.criar(ctx);
  trilha.forEach(({ t, f }) => f(S, t0 + t));
  return S;
}
// renderiza a trilha inteira em WAV (base64), pra exportação
async function trilhaWav(trilha, duracao) {
  const sr = 48000, off = new OfflineAudioContext(2, Math.ceil(sr * duracao), sr);
  agendarTrilha(off, trilha, 0);
  const buf = await off.startRendering();
  const n = buf.length, dados = new DataView(new ArrayBuffer(44 + n * 4));
  const esc = (o, s) => [...s].forEach((c, i) => dados.setUint8(o + i, c.charCodeAt(0)));
  esc(0, "RIFF"); dados.setUint32(4, 36 + n * 4, true); esc(8, "WAVE"); esc(12, "fmt ");
  dados.setUint32(16, 16, true); dados.setUint16(20, 1, true); dados.setUint16(22, 2, true);
  dados.setUint32(24, sr, true); dados.setUint32(28, sr * 4, true); dados.setUint16(32, 4, true); dados.setUint16(34, 16, true);
  esc(36, "data"); dados.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    dados.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    dados.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const bytes = new Uint8Array(dados.buffer);
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
