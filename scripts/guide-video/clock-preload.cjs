// Vidéo guide : décale l'horloge du serveur local pour filmer « un lundi matin au cabinet ».
// Usage : GUIDE_NOW=2026-11-16T08:30:00Z NODE_OPTIONS="--require ./scripts/guide-video/clock-preload.cjs" npx next start
const target = process.env.GUIDE_NOW ? Date.parse(process.env.GUIDE_NOW) : NaN;
if (Number.isFinite(target)) {
  const offset = target - Date.now();
  globalThis.__dawriClock = () => new Date(Date.now() + offset);
}
