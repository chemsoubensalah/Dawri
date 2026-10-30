"use client";
import { useEffect, useRef } from "react";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    /** قيم الرسالة من الخادم (التاريخ، الحالة…) و override = 1: يستطيع الطاقم التجاوز */
    public vars?: Record<string, string | number>,
  ) {
    super(code);
  }
}

/** طلب JSON صغير. يرمي ApiError برمز الخطأ القادم من الخادم. */
export async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; vars?: Record<string, string | number> };
    throw new ApiError(d.error ?? "generic", res.status, d.vars && typeof d.vars === "object" ? d.vars : undefined);
  }
  return data as T;
}

/**
 * يستدعي fn كلّ intervalMs، ويتوقّف حين تكون الصفحة مخفيّة (توفير البطّارية والرصيد)،
 * ويحدّث فوراً عند الرجوع إليها أو عودة الشبكة.
 */
export function usePoll(fn: () => Promise<void> | void, intervalMs: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const run = async () => {
      clearTimeout(timer);
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          await ref.current();
        } catch {}
      }
      if (!stopped) timer = setTimeout(run, intervalMs);
    };
    const wake = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    run();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [intervalMs]);
}

// ——— تذاكر هذا الهاتف (محفوظة محلّياً) ———

interface Saved {
  id: string;
  day: string;
}

const KEY = "dawri:tickets";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
}

export function savedTicket(slug: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Saved>;
    const s = all[slug];
    return s && s.day === today() ? s.id : null;
  } catch {
    return null;
  }
}

export function saveTicket(slug: string, id: string) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Saved>;
    all[slug] = { id, day: today() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

// ——— الأصوات (Web Audio: بلا ملفّات صوتية، لا شيء يُحمَّل على 3G) ———

export type Sound = "new" | "taken" | "next" | "moved" | "alarm";

/** [التردّد Hz, البداية ث, المدّة ث, الشدّة] */
type Tone = [number, number, number, number];

const SOUNDS: Record<Sound, Tone[]> = {
  // زبون جديد أخذ رقماً (شاشة السكرتيرة): نغمتان صاعدتان
  new: [
    [660, 0, 0.16, 0.35],
    [990, 0.18, 0.28, 0.35],
  ],
  // أخذتَ رقمك (هاتف الزبون): ثلاث نغمات مبهجة
  taken: [
    [523, 0, 0.14, 0.3],
    [659, 0.15, 0.14, 0.3],
    [784, 0.3, 0.3, 0.3],
  ],
  // «التالي» (شاشة السكرتيرة وشاشة القاعة): دينغ-دونغ
  next: [
    [880, 0, 0.35, 0.4],
    [660, 0.38, 0.55, 0.4],
  ],
  // تقدّم الطابور (هاتف الزبون): نغمة قصيرة لطيفة
  moved: [[740, 0, 0.12, 0.2]],
  // دورك / تعال الآن: إنذار قويّ متكرّر
  alarm: [0, 0.35, 0.7, 1.4, 1.75, 2.1].map((t) => [880, t, 0.28, 0.5] as Tone),
};

type W = Window & { webkitAudioContext?: typeof AudioContext; __dawriSoundLog?: Sound[] };
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as W).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    return ctx;
  } catch {
    return null;
  }
}

const MUTE_KEY = "dawri:muted";

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(m: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {}
}

/** هل يسمح المتصفّح بالصوت الآن؟ (يمنعه قبل أوّل لمسة على الصفحة) */
export function audioReady(): boolean {
  return audio()?.state === "running";
}

/** يُستدعى داخل لمسة/نقرة: يفتح الصوت لبقيّة الزيارة. */
export async function unlockAudio(): Promise<boolean> {
  const c = audio();
  if (!c) return false;
  try {
    if (c.state !== "running") await c.resume();
    // iOS يحتاج صوتاً فعلياً داخل اللمسة: نغمة صامتة قصيرة
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.01);
  } catch {}
  return c.state === "running";
}

export function playSound(sound: Sound) {
  const w = window as W;
  (w.__dawriSoundLog ??= []).push(sound); // للاختبارات
  if (sound === "alarm") {
    try {
      navigator.vibrate?.([400, 150, 400, 150, 800]);
    } catch {}
  } else if (sound === "taken" || sound === "new") {
    try {
      navigator.vibrate?.(120);
    } catch {}
  }
  if (isMuted()) return;
  const c = audio();
  if (!c) return;
  if (c.state !== "running") c.resume().catch(() => {});
  const t0 = c.currentTime + 0.02;
  for (const [freq, at, dur, vol] of SOUNDS[sound]) {
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = sound === "alarm" ? "square" : "sine";
      o.frequency.value = freq;
      const v = sound === "alarm" ? vol * 0.5 : vol;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(v, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(c.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    } catch {}
  }
}

/** كلّ تذاكر اليوم المحفوظة على هذا الهاتف (كلّ العيادات) — لبطاقة «رقمك اليوم» في الصفحة الرئيسية. */
export function savedTicketsToday(): { slug: string; id: string }[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Saved>;
    const d = today();
    return Object.entries(all)
      .filter(([, s]) => s && typeof s.id === "string" && s.day === d)
      .map(([slug, s]) => ({ slug, id: s.id }));
  } catch {
    return [];
  }
}

// ——— خطوة لم تكتمل (نموذج، رمز SMS، واتساب) ———
// المريض يخرج ليقرأ رسالته أو يفتح واتساب، والمتصفّح قد يعيد تحميل الصفحة أو يغلقها:
// نحفظ ما كتبه وأين وصل، فيجده كما تركه حين يعود (خلال 20 دقيقة).

const FLOW_TTL_MS = 20 * 60_000;

export function loadFlow<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`dawri:flow:${key}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as { at?: number; data?: T };
    if (!v || typeof v.at !== "number" || Date.now() - v.at > FLOW_TTL_MS || v.data == null) {
      localStorage.removeItem(`dawri:flow:${key}`);
      return null;
    }
    return v.data;
  } catch {
    return null;
  }
}

export function saveFlow(key: string, data: unknown) {
  try {
    localStorage.setItem(`dawri:flow:${key}`, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}

export function clearFlow(key: string) {
  try {
    localStorage.removeItem(`dawri:flow:${key}`);
  } catch {}
}
