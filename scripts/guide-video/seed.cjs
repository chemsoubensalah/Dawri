// Vidéo guide : remplit le cabinet de démonstration (serveur local en mémoire) avec des données réalistes.
const HOURS = Object.fromEntries(["6", "0", "1", "2", "3", "4"].map((d) => [d, [["08:00", "12:00"], ["13:30", "17:00"]]]).concat([["5", []]]));
const WAITING = [
  ["Amine Saidi", "0661 11 22 30", "Consultation"],
  ["Nadia Belkacem", "0550 45 12 31", "Plombage"],
  ["Karim Hamidi", "0770 98 34 32", "Contrôle"],
  ["Lina Mansouri", "0661 27 65 33", "Détartrage"],
  ["Yacine Bouzid", "0555 73 20 34", "Extraction"],
  ["Sara Khelifi", "0699 14 58 35", "Consultation"],
  ["Mourad Ziani", "0772 60 41 36", "Plombage"],
];

async function post(r, url, data) {
  const res = await r.post(url, { data });
  if (!res.ok()) throw new Error(`${url} ${res.status()} ${await res.text()}`);
  return res.json();
}

/** r : APIRequestContext déjà connecté ou non ; B : http://localhost:3500 */
async function seed(r, B, L = {}) {
  const S = `${B}/api/staff/demo`;
  await post(r, `${S}/login`, { pin: "1234" });
  await post(r, `${S}/settings`, {
    name: L.clinic ?? "Cabinet dentaire Dr Benali",
    hours: HOURS,
    profile: { doctorName: L.doctor ?? "Dr Karim Benali", specialty: L.specialty ?? "Chirurgien-dentiste", address: L.address ?? "12, rue Didouche Mourad — Alger", phone: "023 45 67 89" },
  });
  await r.post(`${S}/settings`, { data: { email: "dr.benali@exemple.dz" } }); // pas de bandeau « ajoutez votre e-mail »
  await post(r, `${S}/reason`, { mode: "list", required: false, options: ["Consultation", "Contrôle", "Plombage", "Détartrage", "Extraction"], caps: { Plombage: 6 } });
  const bv = await (await r.get(`${S}/booking`)).json();
  await post(r, `${S}/booking`, { ...bv.settings, enabled: true, slotMin: 30, perSlot: 1, daysAhead: 30, minLeadMin: 0, hours: null });
  // file : 3 déjà passés, 1 en consultation, le reste en attente
  for (const [name, phone, reason] of WAITING) await post(r, `${S}/action`, { action: "add", name, phone, reason, present: true });
  for (let i = 0; i < 3; i++) {
    const st = await (await r.get(`${S}/state`)).json();
    await post(r, `${S}/action`, { action: "next", current: st.current?.id ?? null });
  }
  // rendez-vous : aujourd'hui et les jours suivants
  const sl = await (await r.get(`${S}/appointments/slots`)).json();
  const open = sl.days.filter((d) => d.state === "open");
  const book = (d, time, name, phone, reason) => post(r, `${S}/appointments`, { action: "book", name, phone, day: d.day, time, reason }).catch((e) => console.log("seed appt:", e.message.slice(0, 120)));
  await book(open[0], "10:30", "Imane Cherif", "0661 80 12 40", "Contrôle");
  await book(open[0], "11:00", "Rachid Benyahia", "0550 33 71 41", "Plombage");
  await book(open[0], "14:00", "Samia Ferhat", "0770 25 96 42", "Détartrage");
  await book(open[1], "09:00", "Walid Touati", "0555 61 08 43", "Consultation");
  await book(open[1], "09:30", "Meriem Haddad", "0699 47 30 44", "Extraction");
  await book(open[2], "10:00", "Sofiane Larbi", "0661 92 54 45", "Contrôle");
  return { today: sl.today, open: open.map((d) => d.day) };
}

module.exports = { seed, HOURS };
