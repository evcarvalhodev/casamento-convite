const puppeteer = require("puppeteer-core");
const w = ms => new Promise(r => setTimeout(r, ms));
const SAI = "D:/LOW TICKET - CASAMENTOS/";
(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const p = await b.newPage();
  if (!process.argv.includes("--so-artes")) {
    // tela do convite aberto (capa com foto), pra ir dentro do celular da arte
    await p.setViewport({ width: 390, height: 800, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
    await p.goto("https://podeabrir.goupwin.com/convite?para=Tia%20Marta&modelo=classico", { waitUntil: "networkidle2" });
    await w(800); await p.tap("#abrir");
    await w(11000);                       // pétalas terminam de cair
    await p.evaluate(() => scrollTo(0, 0)); await w(600);
    await p.screenshot({ path: SAI + "site/criativos/tela-capa.png" });
    console.log("tela-capa ok");
  }
  if (process.argv.includes("--artes")) {
    await p.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    for (const a of ["a", "b"]) {
      await p.goto(`http://127.0.0.1:5507/criativos/img1.html?arte=${a}`, { waitUntil: "networkidle0" });
      await p.evaluate(() => document.fonts.ready); await w(400);
      await p.screenshot({ path: SAI + `criativos/pode-abrir-img-${a}.png` });
      console.log("arte", a, "ok");
    }
  }
  await b.close();
})();
