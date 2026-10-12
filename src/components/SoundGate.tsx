"use client";
import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import { audioReady, isMuted, playSound, setMuted, unlockAudio } from "@/lib/client";

/**
 * المتصفّحات تمنع الصوت حتى يلمس الشخص الصفحة مرّة.
 * هذا المكوّن: يفتح الصوت عند أوّل لمسة في أيّ مكان، ويُظهر زرّاً واضحاً ما دام الصوت مقفلاً،
 * وزرّ كتم/تشغيل اختيارياً (للسكرتيرة).
 */
export default function SoundGate({
  lang,
  part = "banner",
  tone = "light",
}: {
  lang: Lang;
  part?: "banner" | "toggle";
  /** «dark» لشاشة القاعة. */
  tone?: "light" | "dark";
}) {
  const [ready, setReady] = useState(true); // لا نُظهر الزرّ قبل التحقّق (تفادي الوميض)
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    setReady(audioReady());
    const unlock = async () => {
      if (await unlockAudio()) {
        setReady(true);
        remove();
      }
    };
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const remove = () => events.forEach((e) => window.removeEventListener(e, unlock));
    events.forEach((e) => window.addEventListener(e, unlock));
    return remove;
  }, []);

  return (
    <>
      {part === "banner" && !ready && !muted && (
        <button
          type="button"
          className={`group flex w-full animate-fade-up items-center gap-3 rounded-2xl p-2.5 text-start ring-1 transition ${
            tone === "dark"
              ? "bg-white/[0.07] ring-white/15 hover:bg-white/10"
              : "bg-white shadow-[0_6px_20px_-12px_rgb(15_23_42/0.35)] ring-slate-200 hover:ring-brand-300"
          }`}
          onClick={async () => {
            if (await unlockAudio()) {
              setReady(true);
              playSound("moved");
            }
          }}
          data-testid="sound-gate"
        >
          <span
            className={`inline-flex size-10 shrink-0 animate-pulse-ring items-center justify-center rounded-full ${
              tone === "dark" ? "bg-brand-500/20 text-brand-300" : "bg-brand-50 text-brand-600"
            }`}
          >
            <Volume2 size={20} />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className={`block font-bold ${tone === "dark" ? "text-white" : "text-ink"}`}>{t(lang, "soundEnable")}</span>
            <span className={`block truncate text-sm ${tone === "dark" ? "text-slate-400" : "text-slate-500"}`}>{t(lang, "soundHint")}</span>
          </span>
          <span className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-brand-700">
            {t(lang, "soundCta")}
          </span>
        </button>
      )}
      {part === "toggle" && (
        <button
          type="button"
          className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-white"
          onClick={() => {
            const m = !muted;
            setMuted(m);
            setMutedState(m);
            if (!m) unlockAudio().then(() => playSound("moved"));
          }}
          title={muted ? t(lang, "soundOff") : t(lang, "soundOn")}
          aria-label={muted ? t(lang, "soundOff") : t(lang, "soundOn")}
          aria-pressed={!muted}
          data-testid="mute-toggle"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}
    </>
  );
}
