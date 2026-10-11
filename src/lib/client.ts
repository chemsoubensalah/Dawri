"use client";
import { useEffect, useRef } from "react";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
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
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "generic", res.status);
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

/** صوت تنبيه قصير بلا ملفّات (Web Audio) + اهتزاز. */
export function alertBeep() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 600]);
  } catch {}
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.32);
    });
  } catch {}
}
