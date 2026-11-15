#!/usr/bin/env node
/**
 * Vidéo guide : filme l'application en direct (Chromium + screencast), scène par scène, calée sur la voix.
 *
 *   node record.cjs <lang> <out_dir> [scene ...]
 *
 * Chaque scène repart d'un serveur local neuf (base en mémoire, cabinet de démonstration rempli par seed.cjs),
 * donc une scène peut être refilmée seule. Sortie : <out>/frames/<lang>/<scene>/{000001.jpg…, scene.json}.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { seed } = require("./seed.cjs");

const [lang = "fr", OUT = "/var/tmp/dawri-video/out", ...only] = process.argv.slice(2);
const N = require(`./narration.${lang}.cjs`);
const SCENES = require("./scenes.cjs");
const DUR = JSON.parse(fs.readFileSync(path.join(OUT, `durations.${lang}.json`), "utf8"));
const ROOT = path.resolve(__dirname, "../..");
const PORT = 3600;
const B = `http://localhost:${PORT}`;
const NOW = "2026-11-16T08:30:00Z"; // lundi 9 h 30 à Alger
const W = 1280, H = 720, VH = 660; // scène 1280×720 (×1.5 = 1920×1080) ; application 1280×660 + bandeau 60
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

// ——— serveur local ———
let server = null;
async function startServer() {
  stopServer();
  server = cp.spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, GUIDE_NOW: NOW, NODE_OPTIONS: `--require ${path.join(__dirname, "clock-preload.cjs")}`, DAWRI_PGLITE_DIR: "memory", SESSION_SECRET: "0123456789abcdef0123456789abcdef0123" },
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${B}/api/s/demo/booking`)).status < 500) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("le serveur ne démarre pas");
}
function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid);
  } catch {}
  server = null;
}
process.on("exit", stopServer);

// ——— la scène (page hôte) : application dans une iframe, curseur, zoom, bandeau, cartes ———
const stageHtml = (links, htmlClass) => `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}" class="${htmlClass}"><head><meta charset="utf-8"><title>guide</title>
${links}
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#0b1220;font-family:var(--font-readex),Inter,system-ui,sans-serif;color:#0f172a}
#view{position:absolute;left:0;top:0;width:${W}px;height:${VH}px;overflow:hidden;background:#e9eef4}
#zoom{position:absolute;left:0;top:0;width:${W}px;height:${VH}px;transform-origin:0 0;transition:transform .9s cubic-bezier(.45,0,.2,1)}
#device{position:absolute;left:0;top:0;width:${W}px;height:${VH}px;overflow:hidden;background:#fff}
#app{border:0;display:block;width:100%;height:100%}
/* ordinateur : l'application est agrandie de 15 % (lisible sur un téléphone) */
body.desktop #app{width:calc(100%/1.15);height:calc(100%/1.15);transform:scale(1.15);transform-origin:0 0}
body.phone #view{background:radial-gradient(900px 520px at 12% -10%,#bbf7d0 0,transparent 60%),linear-gradient(135deg,#f0fdf4,#e0f2fe)}
body.phone #device{left:120px;top:20px;width:390px;height:775px;border-radius:44px;box-shadow:0 0 0 12px #0f172a,0 0 0 14px #475569,0 50px 90px -30px rgba(15,23,42,.55);transform:scale(.8);transform-origin:0 0}
[dir=rtl] body.phone #device{left:auto;right:120px;transform-origin:100% 0}
#side{position:absolute;inset-inline-start:530px;top:0;width:690px;height:${VH}px;display:none;flex-direction:column;justify-content:center;gap:20px}
body.phone #side{display:flex}
#side .k{font-size:16px;font-weight:700;letter-spacing:.06em;color:#059669}
#side h1{margin:0;font-size:46px;line-height:1.15;font-weight:700}
#side ul{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:16px}
#side li{display:flex;align-items:center;gap:14px;font-size:24px;color:#334155;opacity:.3;transition:opacity .5s}
#side li.on{opacity:1}
#side li i{flex:none;width:36px;height:36px;border-radius:50%;background:#10b981;color:#fff;font-style:normal;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center}
#cap{position:absolute;left:0;right:0;bottom:0;height:${H - VH}px;background:#0b1220;display:flex;align-items:center;gap:16px;padding:0 22px;color:#fff}
#chip{flex:none;background:#059669;border-radius:999px;padding:5px 14px;font-size:15px;font-weight:700;white-space:nowrap}
#chip:empty{display:none}
#captxt{font-size:21px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .2s}
#brand{margin-inline-start:auto;font-size:15px;font-weight:700;color:#6ee7b7;white-space:nowrap}
#card{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;text-align:center;background:radial-gradient(1000px 600px at 50% -10%,#10b981 0,transparent 65%),linear-gradient(160deg,#064e3b,#022c22);z-index:5}
body.card #card{display:flex}
body.card #cur,body.card #cap{display:none}
#card .logo{width:104px;height:104px;border-radius:28px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}
#card h1{margin:0;font-size:68px;font-weight:700;line-height:1.1}
#card h2{margin:0;font-size:34px;font-weight:600;color:#a7f3d0}
#card p{margin:0;font-size:25px;color:#d1fae5;max-width:900px}
#card ol{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:13px;text-align:start}
#card ol li{display:flex;align-items:center;gap:16px;font-size:27px;font-weight:500;opacity:0;transform:translateY(10px);transition:opacity .5s,transform .5s}
#card ol li.on{opacity:1;transform:none}
#card ol li i{flex:none;width:42px;height:42px;border-radius:50%;background:#34d399;color:#022c22;font-style:normal;font-weight:700;font-size:20px;display:flex;align-items:center;justify-content:center}
#card .in{opacity:0;transform:translateY(14px);transition:opacity .7s,transform .7s}
#card .in.on{opacity:1;transform:none}
#cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(640px,360px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
#rip{position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #10b981;background:rgba(16,185,129,.18);pointer-events:none;opacity:0;z-index:2147483646}
#rip.go{animation:rip .55s ease-out}
@keyframes rip{from{opacity:.95;transform:translate(var(--x),var(--y)) scale(.3)}to{opacity:0;transform:translate(var(--x),var(--y)) scale(1.5)}}
#ring{position:fixed;left:0;top:0;border-radius:14px;box-shadow:0 0 0 3px #f59e0b,0 0 0 10px rgba(245,158,11,.25);pointer-events:none;opacity:0;transition:opacity .3s;z-index:2147483645}
#ring.on{opacity:1;animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{box-shadow:0 0 0 3px #f59e0b,0 0 0 17px rgba(245,158,11,.1)}}
#pip{position:absolute;inset-inline-end:-400px;top:24px;width:330px;height:${VH - 48}px;border-radius:18px;background:#f8fafc;box-shadow:0 30px 70px -15px rgba(15,23,42,.6),0 0 0 1px rgba(15,23,42,.1);overflow:hidden;transition:inset-inline-end .7s cubic-bezier(.45,0,.2,1);z-index:4}
#pip.on{inset-inline-end:28px}
#pip iframe{border:0;width:100%;height:100%}
</style></head>
<body>
<div id="view"><div id="zoom"><div id="device"><iframe id="app" name="app" src="about:blank"></iframe></div></div>
  <div id="side"><div class="k"></div><h1></h1><ul></ul></div>
  <div id="pip"><iframe name="pip" src="about:blank"></iframe></div>
</div>
<div id="cap"><span id="chip"></span><span id="captxt"></span><span id="brand">Dawri · دوري</span></div>
<div id="card"></div>
<div id="ring"></div><div id="rip"></div>
<svg id="cur" width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5v17l4.6-4.3 2.9 6.6 2.7-1.2-2.9-6.5h6.2z" fill="#fff" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>
<script>
const $ = (s) => document.querySelector(s);
const LOGO = '<svg width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#059669"/><circle cx="32" cy="32" r="15" fill="none" stroke="#fff" stroke-width="6"/><circle cx="32" cy="32" r="5.5" fill="#fff"/></svg>';
const app = $("#app"), cur = $("#cur"), rip = $("#rip");
function place(x, y) { cur.style.transform = "translate(" + x + "px," + y + "px)"; }
function ripple(x, y) { rip.style.setProperty("--x", x + "px"); rip.style.setProperty("--y", y + "px"); rip.classList.remove("go"); void rip.offsetWidth; rip.classList.add("go"); }
addEventListener("pointermove", (e) => place(e.clientX, e.clientY), true);
addEventListener("pointerdown", (e) => ripple(e.clientX, e.clientY), true);
function hook(f) {
  try {
    const d = f.contentWindow.document;
    const map = (e) => { const r = f.getBoundingClientRect(); return [r.left + (e.clientX * r.width) / f.clientWidth, r.top + (e.clientY * r.height) / f.clientHeight]; };
    d.addEventListener("pointermove", (e) => place(...map(e)), true);
    d.addEventListener("pointerdown", (e) => ripple(...map(e)), true);
    const st = d.createElement("style");
    st.textContent = "html{scrollbar-width:none}";
    d.head.appendChild(st);
  } catch {}
}
app.addEventListener("load", () => hook(app));
window.stage = {
  mode(m) { document.body.className = m; },
  cap(chip, text) { $("#chip").textContent = chip || ""; const c = $("#captxt"); c.style.opacity = 0; setTimeout(() => { c.textContent = text || ""; c.style.opacity = 1; }, 180); },
  side(k, title, points) { $("#side .k").textContent = k; $("#side h1").textContent = title; $("#side ul").innerHTML = points.map((p, i) => "<li><i>" + (i + 1) + "</i><span></span></li>").join(""); [...document.querySelectorAll("#side li span")].forEach((s, i) => (s.textContent = points[i])); },
  sideOn(n) { document.querySelectorAll("#side li").forEach((li, i) => li.classList.toggle("on", i < n)); },
  zoom(s, tx, ty) { $("#zoom").style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")"; },
  ring(r) { const el = $("#ring"); if (!r) return el.classList.remove("on"); Object.assign(el.style, { transform: "translate(" + r.x + "px," + r.y + "px)", width: r.w + "px", height: r.h + "px" }); el.classList.add("on"); },
  pip(url) { const p = $("#pip"); if (url) { p.querySelector("iframe").src = url; setTimeout(() => p.classList.add("on"), 400); } else p.classList.remove("on"); },
  card(c) {
    const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
    $("#card").innerHTML = c.plan
      ? '<h2 class="in">' + esc(c.title) + "</h2><ol>" + c.plan.map((p, i) => "<li><i>" + (i + 1) + "</i>" + esc(p) + "</li>").join("") + "</ol>"
      : '<div class="logo in">' + LOGO + '</div><h1 class="in">' + esc(c.title) + "</h1>" + (c.h2 ? '<h2 class="in">' + esc(c.h2) + "</h2>" : "") + '<p class="in">' + esc(c.sub || "") + "</p>";
    document.querySelectorAll("#card .in").forEach((el, i) => setTimeout(() => el.classList.add("on"), 150 + i * 280));
  },
  cardItem(n) { document.querySelectorAll("#card ol li").forEach((li, i) => li.classList.toggle("on", i < n)); },
};
</script></body></html>`;

class Stage {
  constructor(page, scene) {
    this.page = page;
    this.scene = scene;
    this.pos = [640, 360];
    this.z = { s: 1, tx: 0, ty: 0 };
    this.timeline = [];
    this.t0 = 0;
    this.B = B;
    this.N = N;
    this.lang = lang;
  }
  /** l'application (dans l'iframe) */
  get f() {
    return this.page.frameLocator("#app");
  }
  frame() {
    return this.page.frame({ name: "app" });
  }
  sleep(ms) {
    return sleep(ms);
  }
  ev(fn, arg) {
    return this.page.evaluate(fn, arg);
  }
  async mode(m) {
    await this.ev((x) => window.stage.mode(x), m);
    this.phone = m === "phone";
  }
  async goto(url) {
    await Promise.all([this.frame().waitForNavigation({ waitUntil: "load" }), this.ev((u) => (document.getElementById("app").src = u), B + url)]);
    await this.frame().waitForLoadState("networkidle").catch(() => {});
    await sleep(350);
  }
  async cap(text) {
    await this.ev(([c, t]) => window.stage.cap(c, t), [this.scene.chip || "", text || ""]);
  }
  /** zone visible de l'application, en coordonnées de la page hôte */
  view() {
    return this.phone ? (lang === "ar" ? { x: W - 120 - 312, y: 20, w: 312, h: 620 } : { x: 120, y: 20, w: 312, h: 620 }) : { x: 0, y: 0, w: W, h: VH };
  }
  async box(loc) {
    const b = await loc.first().boundingBox();
    if (!b) throw new Error(`[${this.scene.id}] élément introuvable : ${loc}`);
    return b;
  }
  /** fait défiler doucement jusqu'à l'élément s'il n'est pas à l'écran */
  async reveal(loc, block = "center") {
    const v = this.view();
    const b = await loc.first().boundingBox();
    const top = this.phone ? 8 : 80 * this.z.s;
    if (b && b.y >= v.y + top && b.y + b.height <= v.y + v.h - 16) return;
    await loc.first().evaluate((el, blk) => el.scrollIntoView({ block: blk, behavior: "smooth" }), block);
    await this.settle();
  }
  /** attend la fin d'un défilement doux (la position ne bouge plus) */
  async settle(max = 5000) {
    const y = () => this.frame().evaluate(() => Math.round(window.scrollY)).catch(() => 0);
    let last = await y(), still = 0;
    for (const t0 = Date.now(); Date.now() - t0 < max && still < 3; ) {
      await sleep(110);
      const v = await y();
      still = v === last ? still + 1 : 0;
      last = v;
    }
    await sleep(150);
  }
  async moveTo(x, y, ms) {
    const [x0, y0] = this.pos;
    const dist = Math.hypot(x - x0, y - y0);
    ms = ms ?? Math.max(380, Math.min(950, 260 + dist * 0.9));
    const start = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - start) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      if (k >= 1) break;
      await sleep(12);
    }
    this.pos = [x, y];
  }
  async hover(loc, ms) {
    await this.reveal(loc);
    const b = await this.box(loc);
    await this.moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
  }
  async click(loc, { after = 450, at, reveal = true } = {}) {
    if (reveal) await this.reveal(loc);
    const b = await this.box(loc);
    await this.moveTo(b.x + b.width * (at?.[0] ?? 0.5), b.y + b.height * (at?.[1] ?? 0.5));
    await sleep(160);
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
    await sleep(after);
  }
  async type(loc, text, { delay = 60 } = {}) {
    await this.click(loc, { after: 180 });
    await this.page.keyboard.type(text, { delay });
    await sleep(250);
  }
  /** cadre orange autour d'un élément (sans cliquer) */
  async ring(loc, pad = 6) {
    await this.reveal(loc);
    const b = await this.box(loc);
    await this.ev((r) => window.stage.ring(r), { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad });
  }
  async unring() {
    await this.ev(() => window.stage.ring(null));
    await sleep(250);
  }
  /** zoom sur un élément (ordinateur) ; ax, ay : où le placer dans l'image (0–1) */
  async zoomOn(loc, s = 1.45, { ax = 0.5, ay = 0.5 } = {}) {
    await this.unring();
    await this.reveal(loc);
    const b = await this.box(loc);
    const ux = (b.x + b.width / 2 - this.z.tx) / this.z.s, uy = (b.y + b.height / 2 - this.z.ty) / this.z.s;
    const tx = Math.min(0, Math.max(W - s * W, W * ax - s * ux)), ty = Math.min(0, Math.max(VH - s * VH, VH * ay - s * uy));
    this.z = { s, tx, ty };
    await this.ev((z) => window.stage.zoom(z.s, z.tx, z.ty), this.z);
    await sleep(1000);
  }
  async zoomOut() {
    if (this.z.s === 1) return;
    await this.unring();
    this.z = { s: 1, tx: 0, ty: 0 };
    await this.ev((z) => window.stage.zoom(z.s, z.tx, z.ty), this.z);
    await sleep(1000);
  }
  /** un passage du commentaire : l'action démarre avec la voix, et on attend la fin de la voix */
  async beat(id, fn) {
    const key = `${this.scene.id}.${id}`;
    const def = this.scene.beats.find((b) => b.id === id);
    if (!def || DUR[key] == null) throw new Error(`passage inconnu : ${key}`);
    const t = now() - this.t0;
    this.timeline.push({ key, t });
    if (def.cap !== undefined) await this.cap(def.cap);
    if (fn) await fn(DUR[key]);
    const left = DUR[key] + 0.5 - (now() - this.t0 - t);
    if (left > 0) await sleep(left * 1000);
  }
  /** attend jusqu'à `s` secondes après le début du passage en cours (pour caler un geste sur une phrase) */
  async at(s) {
    const last = this.timeline[this.timeline.length - 1];
    const left = last.t + s - (now() - this.t0);
    if (left > 0) await sleep(left * 1000);
  }
}

async function recordScene(browser, scene) {
  const def = SCENES[scene.id];
  if (!def) throw new Error(`scène sans mise en scène : ${scene.id}`);
  await startServer();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, locale: lang === "ar" ? "ar-DZ" : "fr-FR" });
  await ctx.addCookies([{ name: "lang", value: lang, url: B }]);
  await ctx.clock.install({ time: new Date(NOW) });
  const data = await seed(ctx.request, B);
  if (def.loggedOut) await ctx.clearCookies().then(() => ctx.addCookies([{ name: "lang", value: lang, url: B }]));
  const html = await (await ctx.request.get(`${B}/s/demo`)).text();
  const links = (html.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || []).join("\n");
  const htmlClass = (html.match(/<html[^>]*class="([^"]*)"/) || [])[1] || "";
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${scene.id}] pageerror: ${e.message}`));
  await page.route(`${B}/__stage`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: stageHtml(links, htmlClass) }));
  await page.goto(`${B}/__stage`);
  await page.evaluate(() => document.fonts.ready);
  const S = new Stage(page, scene);
  S.data = data;
  S.ctx = ctx;
  await S.mode(def.mode || "desktop");
  if (scene.side) await S.ev(([k, s]) => window.stage.side(k, s.title, s.points), [scene.chip, scene.side]);
  await S.cap("");
  if (def.pre) await def.pre(S);
  await page.mouse.move(S.pos[0], S.pos[1]);
  await sleep(400);

  // ——— enregistrement ———
  const dir = path.join(OUT, "frames", lang, scene.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", (f) => {
    const name = `${String(frames.length + 1).padStart(6, "0")}.jpg`;
    frames.push([name, f.metadata.timestamp]);
    fs.writeFileSync(path.join(dir, name), Buffer.from(f.data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await sleep(350);
  S.t0 = now();
  try {
    await def.run(S);
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `fail-${scene.id}.png`) }).catch(() => {});
    await ctx.close();
    throw e;
  }
  await sleep(500);
  const end = now();
  await cdp.send("Page.stopScreencast");
  await sleep(200);
  fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify({ id: scene.id, start: S.t0, end, timeline: S.timeline, frames }));
  console.log(`  ${scene.id} : ${(end - S.t0).toFixed(1)} s, ${frames.length} images`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let failed = 0;
  for (const scene of N.scenes) {
    if (only.length && !only.includes(scene.id)) continue;
    try {
      await recordScene(browser, scene);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${scene.id} : ${String(e.message).split("\n").slice(0, 4).join(" | ")}`);
    }
  }
  await browser.close();
  stopServer();
  process.exit(failed ? 1 : 0);
})();
