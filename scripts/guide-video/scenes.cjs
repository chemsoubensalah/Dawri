// Vidéo guide : la mise en scène de chaque chapitre (ce que fait le curseur pendant que la voix parle).
// S = Stage (record.cjs) : S.f = l'application, S.beat(id, fn) = un passage du commentaire.

const T = {
  fr: { soundOn: "Activer", addPerson: "Ajouter une personne", recall: "Rappeler", stopConfirm: "Arrêter les entrées", stats: "Statistiques" },
  ar: { soundOn: "تفعيل", addPerson: "أضف شخصاً", recall: "أعد النداء", stopConfirm: "أوقف الاستقبال", stats: "الإحصائيات" },
};

/** ouvre une page du personnel, son déjà activé (hors champ) */
async function staff(S, url = "/staff/demo") {
  await S.goto(url);
  const b = S.f.getByTestId("sound-gate").getByRole("button");
  if (await b.count()) {
    await b.first().click().catch(() => {});
    await S.sleep(300);
  }
}
const api = (S, body) => S.ctx.request.post(`${S.B}/api/staff/demo/action`, { data: body });
const state = async (S) => (await S.ctx.request.get(`${S.B}/api/staff/demo/state`)).json();
const scrollApp = (S, top) => S.frame().evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), top);
const panel = (S) => S.f.locator("section", { has: S.f.getByTestId("current-number") }).first();

/** glisser-déposer « humain » : attraper, glisser, lâcher */
async function drag(S, from, to, { dy = 0 } = {}) {
  const a = await S.box(from), b = await S.box(to);
  await S.moveTo(a.x + a.width / 2, a.y + a.height / 2);
  await S.sleep(250);
  await S.page.mouse.down();
  await S.sleep(250);
  await S.moveTo(a.x + a.width / 2, b.y + b.height / 2 + dy, 1500);
  await S.sleep(450);
  await S.page.mouse.up();
  await S.sleep(600);
}

/** dans la fenêtre de rendez-vous de la secrétaire : jour dans le calendrier, puis heure */
async function pickSlot(S, day, time) {
  const dlg = S.f.locator("dialog[open]");
  if (!(await dlg.getByTestId("day-calendar").count())) await S.click(dlg.getByTestId("desk-days-toggle"), { after: 600 });
  if (!(await dlg.getByTestId(`cal-${day}`).count())) await S.click(dlg.getByTestId("cal-next"), { after: 500 });
  await S.click(dlg.getByTestId(`cal-${day}`), { after: 700 });
  await S.click(dlg.getByTestId(`time-${time}`), { after: 500 });
}

module.exports = {
  intro: {
    mode: "card",
    async run(S) {
      const c = S.N.card;
      await S.ev((c) => window.stage.card({ title: c.brand, h2: c.title, sub: c.sub }), c);
      await S.beat("hello");
      await S.ev((c) => window.stage.card({ title: c.planTitle, plan: c.plan }), c);
      await S.beat("plan", async (d) => {
        for (let i = 1; i <= c.plan.length; i++) {
          await S.at(0.5 + ((d - 1.5) * (i - 1)) / c.plan.length);
          await S.ev((n) => window.stage.cardItem(n), i);
        }
      });
    },
  },

  "patient-ticket": {
    mode: "phone",
    pre: (S) => S.goto("/s/demo"),
    async run(S) {
      const f = S.f;
      await S.beat("page", async () => {
        await S.ev(() => window.stage.sideOn(1));
        await S.at(9.5);
        await S.ring(f.locator("section[aria-live=polite]").first(), 4);
      });
      await S.unring();
      await S.beat("form", async () => {
        await S.ev(() => window.stage.sideOn(2));
        await S.type(f.locator("#name"), "Hichem Brahimi");
        await S.type(f.locator("#phone"), "0661554433");
        await S.click(f.locator("form").getByText("Consultation", { exact: true }));
      });
      await S.beat("code", async () => {
        // le code de démonstration reste hors champ : dans la vraie vie, il arrive par SMS
        await S.frame().addStyleTag({ content: "form p:has(> b.num){display:none!important}" });
        await S.click(f.getByTestId("take-submit"), { after: 900 });
        await f.locator("#code").waitFor();
        const code = (await f.locator("form p:has(> b.num) b").first().evaluate((el) => el.textContent)).trim();
        await S.at(3.2);
        await S.type(f.locator("#code"), code, { delay: 170 });
        await S.click(f.locator("form button.btn-primary").first(), { after: 300 });
        await f.getByTestId("my-number").waitFor();
      });
      await S.beat("ticket", async () => {
        await S.ev(() => window.stage.sideOn(3));
        await S.at(4);
        await scrollApp(S, 260);
        await S.at(9);
        await scrollApp(S, 0);
      });
    },
  },

  "patient-book": {
    mode: "phone",
    pre: (S) => S.goto("/s/demo/book"),
    async run(S) {
      const f = S.f;
      const day = S.data.open[1]; // demain
      await S.beat("pick", async () => {
        await S.ev(() => window.stage.sideOn(1));
        await S.at(4);
        await S.click(f.getByTestId(`day-${day}`), { after: 900 });
        await S.click(f.getByTestId("time-10:30"), { after: 700 });
      });
      await S.beat("confirm", async () => {
        await S.ev(() => window.stage.sideOn(2));
        await S.frame().addStyleTag({ content: "form p:has(> b.num){display:none!important}" });
        await S.type(f.locator("#bk-name"), "Hichem Brahimi");
        await S.type(f.locator("#bk-phone"), "0661554433");
        await S.click(f.getByTestId("book-submit"), { after: 900 });
        await f.locator("#bk-code").waitFor();
        const code = (await f.locator("form p:has(> b.num) b").first().evaluate((el) => el.textContent)).trim();
        await S.type(f.locator("#bk-code"), code, { delay: 150 });
        await S.click(f.getByTestId("book-submit"), { after: 300 });
        await f.getByTestId("appointment").waitFor();
      });
      await S.beat("done", async () => {
        await S.ev(() => window.stage.sideOn(3));
        await S.at(4.5);
        await scrollApp(S, 330);
        await S.at(11);
        await scrollApp(S, 0);
      });
    },
  },

  login: {
    loggedOut: true,
    pre: (S) => S.goto("/staff/demo"),
    async run(S) {
      const f = S.f;
      await S.beat("pin", async () => {
        await S.at(5.2);
        await S.type(f.locator("#pin"), "1234", { delay: 260 });
        await S.click(f.locator("button[type=submit]").first(), { after: 300 });
        await f.getByTestId("next").waitFor();
        await S.frame().waitForLoadState("networkidle").catch(() => {});
      });
      await S.beat("menu", async () => {
        await S.at(2.6);
        await S.ring(f.locator("nav").first(), 5);
      });
      await S.beat("panels", async () => {
        await S.ring(panel(S), 4);
        await S.at(4.2);
        await S.ring(f.getByTestId("queue"), 4);
        await S.at(7.4);
        await S.ring(f.getByTestId("today-appointments"), 4);
      });
      await S.unring();
      await S.beat("sound", async () => {
        // après une vraie connexion le son est déjà débloqué : on montre le bouton haut-parleur
        const b = f.getByTestId("mute-toggle");
        await S.reveal(b);
        await S.ring(b, 6);
        await S.hover(b);
      });
    },
  },

  call: {
    async pre(S) {
      for (const [name, phone, reason] of [["Farid Meziane", "0661 40 22 37", "Contrôle"], ["Asma Djebbar", "0550 18 77 38", "Consultation"], ["Nassim Kaci", "0770 52 09 39", "Détartrage"]]) {
        await api(S, { action: "add", name, phone, reason, present: true });
      }
      await staff(S);
    },
    async run(S) {
      const f = S.f;
      await S.beat("next", async () => {
        await S.zoomOn(panel(S), 1.28, { ax: 0.36, ay: 0.45 });
        await S.at(2.4);
        await S.click(f.getByTestId("next"));
      });
      await S.beat("absent", async () => {
        await S.at(2.6);
        await S.click(f.getByTestId("no-show"), { after: 800 });
        await S.at(5);
        await S.click(f.getByTestId("confirm-yes"));
      });
      await S.beat("recall", async () => {
        const b = f.getByRole("button", { name: T[S.lang].recall }).first();
        await S.hover(b);
        await S.ring(b, 4);
        await S.at(2);
        await S.click(b);
      });
      await S.unring();
      await S.beat("callnow", async () => {
        const row = f.getByTestId("queue-row").nth(2);
        await S.zoomOn(f.getByTestId("queue-row").nth(1), 1.28, { ax: 0.36, ay: 0.55 });
        await S.ring(row.getByTestId("call-now"), 5);
        await S.at(4.2);
        await S.unring();
        await S.click(row.getByTestId("call-now"), { after: 900 });
        await S.zoomOn(panel(S), 1.28, { ax: 0.36, ay: 0.45 });
      });
      await S.beat("finish", async (d) => {
        await S.at(3.2);
        await S.click(f.getByTestId("finish"));
        await S.at(d - 2.4);
        await S.click(f.getByTestId("next"));
      });
      await S.zoomOut();
    },
  },

  add: {
    pre: (S) => staff(S),
    async run(S) {
      const f = S.f;
      const dlg = f.locator("dialog[open]");
      await S.beat("open", async () => {
        const b = f.getByRole("button", { name: T[S.lang].addPerson }).first();
        await S.ring(b, 4);
        await S.at(5.4);
        await S.unring();
        await S.click(b, { after: 700 });
      });
      await S.beat("fill", async () => {
        await S.type(f.locator("#add-name"), "Hakim Boudiaf");
        await S.type(f.locator("#add-phone"), "0550203040");
        await S.click(dlg.getByText("Plombage", { exact: true }));
      });
      await S.beat("print", async () => {
        await S.click(dlg.getByTestId("add-print"), { after: 700 });
        await S.click(dlg.locator("form button.btn-primary").last(), { after: 900 });
        const st = await state(S);
        const me = st.waiting.find((w) => w.name === "Hakim Boudiaf");
        await S.ev((u) => window.stage.pip(u), `${S.B}/staff/demo/print?t=${me.id}&preview=1`);
        await S.reveal(f.getByTestId("queue-row").last());
      });
      await S.sleep(600);
      await S.ev(() => window.stage.pip(null));
      await S.sleep(700);
    },
  },

  reorder: {
    pre: (S) => staff(S),
    async run(S) {
      const f = S.f;
      const rows = f.getByTestId("queue-row");
      const card = f.locator("section", { has: f.getByTestId("queue") }).first();
      await S.beat("drag", async () => {
        // toute la file à l'écran, sous le menu
        await card.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 74, behavior: "smooth" }));
        await S.sleep(800);
        await S.zoomOn(f.getByTestId("queue"), 1.16, { ax: 0.36, ay: 0.5 });
        await S.ring(rows.last().getByTestId("drag-handle"), 5);
        await S.at(4);
        await S.unring();
        await drag(S, rows.last().getByTestId("drag-handle"), rows.nth(0), { dy: -14 });
      });
      await S.beat("after", async () => {
        await S.ring(f.getByTestId("queue"), 3);
      });
      await S.unring();
      await S.zoomOut();
    },
  },

  recent: {
    pre: (S) => staff(S),
    async run(S) {
      const f = S.f;
      const recent = f.getByTestId("recent");
      await S.beat("list", async () => {
        await S.reveal(recent);
        await S.zoomOn(recent, 1.25, { ax: 0.62, ay: 0.5 });
        await S.ring(recent, 4);
      });
      await S.unring();
      await S.beat("restore", async () => {
        await S.at(2.6);
        await S.click(recent.getByTestId("restore").first(), { after: 900 });
        await S.zoomOut();
        await S.ring(f.getByTestId("queue-row").first(), 3);
      });
      await S.unring();
      await S.beat("nextappt", async () => {
        await S.click(recent.getByTestId("next-appt-recent").first(), { after: 900 });
        await S.at(7.6);
        await pickSlot(S, S.data.open[6], "10:00");
        await S.at(14.2);
        await S.click(f.locator("dialog[open]").getByTestId("ap-desk-submit"), { after: 900 });
      });
    },
  },

  stop: {
    pre: (S) => staff(S),
    async run(S) {
      const f = S.f;
      await S.beat("off", async () => {
        await S.zoomOn(f.getByTestId("accepting-switch"), 1.3, { ax: 0.3, ay: 0.3 });
        await S.ring(f.getByTestId("accepting-switch"), 6);
        await S.at(5.2);
        await S.unring();
        await S.click(f.getByTestId("accepting-switch"), { after: 900 });
        await S.click(f.getByRole("button", { name: T[S.lang].stopConfirm }).first(), { after: 600 });
      });
      await S.beat("on", async () => {
        await S.at(0.8);
        await S.click(f.getByTestId("accepting-switch"), { after: 600 });
      });
      await S.zoomOut();
    },
  },

  appts: {
    pre: (S) => staff(S, "/staff/demo/appointments"),
    async run(S) {
      const f = S.f;
      await S.beat("list", async () => {
        await S.at(2.6);
        await scrollApp(S, 420);
        await S.at(5.4);
        await scrollApp(S, 0);
      });
      await S.beat("search", async () => {
        await S.type(f.getByTestId("ap-search"), "Meriem", { delay: 130 });
        await S.at(4.6);
        await f.getByTestId("ap-search").fill("");
      });
      await S.beat("new", async () => {
        await S.at(2.4);
        await S.click(f.getByTestId("ap-add-page"), { after: 700 });
        await S.at(4.6);
        await pickSlot(S, S.data.open[7], "11:00");
        const dlg = f.locator("dialog[open]");
        await S.type(dlg.locator("#ap-name"), "Djamel Aouad", { delay: 45 });
        await S.type(dlg.locator("#ap-phone"), "0661708090", { delay: 45 });
        await S.click(dlg.getByTestId("ap-desk-submit"), { after: 900 });
      });
      await S.beat("arrived", async () => {
        const b = f.getByTestId("appt-staff-checkin").first();
        await S.reveal(b);
        await S.ring(b, 5);
        await S.at(4.2);
        await S.unring();
        await S.click(b, { after: 800 });
      });
      await S.beat("tools", async () => {
        const row = f.getByTestId("appt-11:00").first();
        await S.ring(row.getByTestId("print-appt"), 5);
        await S.at(3.6);
        await S.ring(row.locator("button").last(), 5);
      });
      await S.unring();
    },
  },

  tv: {
    pre: (S) => S.goto("/d/demo"),
    async run(S) {
      const f = S.f;
      await S.beat("show");
      await S.beat("live", async () => {
        const st = await state(S);
        await api(S, { action: "next", current: st.current?.id ?? null });
        await S.at(5.6);
        const qr = f.locator("img[src^='data:image'], canvas, svg[viewBox]").last().locator("xpath=../..");
        await S.ring(qr, 4).catch(() => {});
      });
      await S.unring();
    },
  },

  tools: {
    pre: (S) => staff(S, "/staff/demo/qr"),
    async run(S) {
      const f = S.f;
      await S.beat("qr", async () => {
        await S.at(2.4);
        await scrollApp(S, 300);
      });
      await S.beat("stats", async () => {
        await scrollApp(S, 0);
        await S.click(f.getByRole("link", { name: T[S.lang].stats }).first(), { after: 300 });
        await S.frame().waitForURL(/\/stats/);
        await S.frame().waitForLoadState("networkidle").catch(() => {});
        await S.at(5);
        await scrollApp(S, 160);
      });
    },
  },

  settings: {
    pre: (S) => staff(S, "/staff/demo/settings"),
    async run(S) {
      const f = S.f;
      /** va à une section : clic dans le menu latéral s'il est à l'écran, puis on attend la fin du défilement */
      const nav = async (id) => {
        const link = f.locator(`a[href="#${id}"]`).first();
        const b = await link.boundingBox();
        const section = f.locator(`section#${id}`);
        if (b && b.y > 80 && b.y + b.height < 640) await S.click(link, { after: 200, reveal: false });
        else await section.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "smooth" }));
        await S.settle();
        // arrivé ailleurs (défilement interrompu) : on se place sur la section
        const top = await section.evaluate((el) => el.getBoundingClientRect().top);
        if (top < -40 || top > 260) {
          await section.evaluate((el) => el.scrollIntoView({ block: "start" }));
          await S.settle(1500);
        }
      };
      await S.beat("profile", async () => {
        await S.at(3.4);
        await S.ring(f.locator("#profile"), 2);
      });
      await S.unring();
      await S.beat("hours", async () => {
        await nav("hours");
        await S.at(5.6);
        await nav("daysoff");
      });
      await S.beat("reason", async () => {
        await nav("reason");
        await S.at(6.4);
        const cap = f.locator("#reason input[type=number]").nth(2); // le plafond de « Plombage »
        // au milieu de l'écran (le bas est couvert par le bouton « Enregistrer »)
        await cap.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
        await S.settle();
        await S.ring(cap, 6);
      });
      await S.unring();
      await S.beat("limits", async () => {
        await nav("limits");
        const days = f.getByTestId("limits-days");
        await S.reveal(days);
        await S.at(3.4);
        await S.click(days, { after: 200 });
        await S.page.keyboard.press("Control+a");
        await S.page.keyboard.type("7", { delay: 80 });
        await S.at(8.6);
        await S.ring(f.getByTestId("limits-override").locator("xpath=.."), 3);
      });
      await S.unring();
      await S.beat("booking", async () => {
        await nav("booking");
        await S.at(4.4);
        await S.ring(f.locator("#booking [role=radiogroup]").first(), 6);
        await S.at(7.4);
        await S.ring(f.locator("#booking input[type=number]").first().locator("xpath=../.."), 4);
      });
      await S.unring();
      await S.beat("walkin", async () => {
        const w = f.getByTestId("walkin-settings");
        await S.reveal(w);
        await S.ring(w, 3);
        await S.at(3.6);
        await S.unring();
        await S.click(f.getByTestId("walkin-day-6"), { after: 500 });
      });
      await S.beat("printing", async () => {
        await nav("printing");
        await S.at(3.2);
        await S.click(f.getByTestId("print-paper-58"), { after: 900 });
        await S.click(f.getByTestId("print-lang-both"), { after: 600 });
        await S.at(9.6);
        await S.reveal(f.getByTestId("block-name"));
        await S.click(f.getByTestId("block-date").locator("input[type=checkbox]"), { after: 900 });
        await S.click(f.getByTestId("block-name").locator("button").nth(2), { after: 900 });
        await S.ring(f.getByTestId("print-preview"), 3);
      });
      await S.unring();
      await S.beat("rules", async () => {
        await nav("rules");
        await S.at(2.2);
        await S.ring(f.locator("#defaultServiceMin").locator("xpath=.."), 5);
      });
      await S.unring();
      await S.beat("sms", async () => {
        await nav("sms");
        await S.at(5);
        await scrollApp(S, (await S.frame().evaluate(() => window.scrollY)) + 240);
      });
      await S.beat("security", async () => {
        await nav("security");
        await S.at(2.6);
        await S.ring(f.locator("#pin"), 6);
        await S.at(6);
        const asst = f.getByText(S.lang === "ar" ? "رمز السكرتيرة" : "Code de la secrétaire").first();
        await S.reveal(asst);
        await S.ring(asst.locator("xpath=.."), 6);
      });
      await S.unring();
    },
  },

  outro: {
    mode: "card",
    async run(S) {
      const c = S.N.card;
      await S.ev((c) => window.stage.card({ title: c.endTitle, sub: c.endSub }), c);
      await S.beat("bye");
      await S.sleep(600);
    },
  },
};
