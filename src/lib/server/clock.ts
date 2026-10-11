type G = { __dawriClock?: () => Date };
const g = globalThis as G;

export function now(): Date {
  return g.__dawriClock ? g.__dawriClock() : new Date();
}

/** للاختبارات: تثبيت الوقت. */
export function setClock(fn: (() => Date) | undefined) {
  g.__dawriClock = fn;
}
