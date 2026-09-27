// Exporta um criativo (página animada) em MP4 1080x1920 30fps com a trilha.
// O relógio da página é trocado por um relógio virtual: cada quadro avança
// exatamente 1/30 s, então o vídeo sai liso mesmo que a máquina seja lenta.
// uso: node exportar.js <url> <saida.mp4>
const puppeteer = require("puppeteer-core");
const { spawn } = require("child_process");
const fs = require("fs");
const [, , URL_, SAIDA] = process.argv;
const FPS = 30;

const RELOGIO = `(() => {
  let vt = 0;
  const base = Date.now();
  const DataOrig = Date;
  performance.now = () => vt;
  Date.now = () => base + vt;
  let rafs = new Map(), rafId = 0;
  window.requestAnimationFrame = cb => { rafs.set(++rafId, cb); return rafId; };
  window.cancelAnimationFrame = id => rafs.delete(id);
  let timers = new Map(), timerId = 0;
  const st = window.setTimeout.bind(window);
  window.setTimeout = (cb, ms = 0, ...a) => { timers.set(++timerId, { at: vt + (+ms || 0), cb, a }); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  window.setInterval = (cb, ms = 0, ...a) => { const id = ++timerId; const t = { at: vt + ms, cb, a, iv: ms || 1 }; timers.set(id, t); return id; };
  window.clearInterval = id => timers.delete(id);
  const vistos = new WeakMap();
  window.__vtAtivo = false;
  window.__passo = (ms) => {
    window.__vtAtivo = true;
    const alvo = vt + ms;
    // timers vencidos, em ordem
    for (let guarda = 0; guarda < 500; guarda++) {
      let prox = null, pid = null;
      for (const [id, t] of timers) if (t.at <= alvo && (!prox || t.at < prox.at)) { prox = t; pid = id; }
      if (!prox) break;
      vt = Math.max(vt, prox.at);
      if (prox.iv) prox.at += prox.iv; else timers.delete(pid);
      try { typeof prox.cb === "function" ? prox.cb(...prox.a) : 0; } catch (e) { console.error(e); }
    }
    vt = alvo;
    const cbs = [...rafs.values()]; rafs.clear();
    for (const cb of cbs) { try { cb(vt); } catch (e) { console.error(e); } }
    // animações de CSS seguem o mesmo relógio
    for (const an of document.getAnimations()) {
      if (!vistos.has(an)) { vistos.set(an, vt); an.pause(); }
      an.currentTime = vt - vistos.get(an);
    }
    // e os iframes também
    for (const f of document.querySelectorAll("iframe")) { try { f.contentWindow.__passo && f.contentWindow.__passo(ms); } catch (_) {} }
  };
})();`;

(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const p = await b.newPage();
  p.on("pageerror", e => console.log("erro na página:", e.message));
  await p.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument(RELOGIO);
  await p.goto(URL_ + (URL_.includes("?") ? "&" : "?") + "exportar=1", { waitUntil: "networkidle0", timeout: 60000 });
  // antes do play, o relógio virtual precisa andar pra página montar (iframe + setTimeout de 900ms)
  for (let i = 0; i < 200 && !(await p.evaluate(() => window.PRONTO)); i++) {
    await p.evaluate(() => __passo(50));
    await new Promise(r => setTimeout(r, 30));
  }
  const dur = await p.evaluate(() => DURACAO);
  console.log("pronto; duração", dur, "s");
  const wav = await p.evaluate(() => trilhaWav(TRILHA, DURACAO));
  const wavPath = SAIDA.replace(/\.mp4$/, ".wav");
  fs.writeFileSync(wavPath, Buffer.from(wav, "base64")); console.log("trilha salva");
  await p.evaluate(() => { darPlay(); });
  console.log("play"); const cdp = await p.createCDPSession(); console.log("cdp ok");

  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-i", wavPath, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", SAIDA], { stdio: ["pipe", "inherit", "inherit"] });
  const total = process.env.QUADROS ? +process.env.QUADROS : Math.round(dur * FPS);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 95, optimizeForSpeed: true });
    const img = Buffer.from(data, "base64");
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once("drain", r));
    await p.evaluate(ms => __passo(ms), 1000 / FPS);
    if (i % 60 === 0) console.log(`quadro ${i}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  await b.close();
  console.log("feito:", SAIDA);
})();
