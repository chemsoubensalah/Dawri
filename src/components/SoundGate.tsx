"use client";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import { audioReady, isMuted, playSound, setMuted, unlockAudio } from "@/lib/client";

/**
 * المتصفّحات تمنع الصوت حتى يلمس الشخص الصفحة مرّة.
 * هذا المكوّن: يفتح الصوت عند أوّل لمسة في أيّ مكان، ويُظهر زرّاً واضحاً ما دام الصوت مقفلاً،
 * وزرّ كتم/تشغيل اختيارياً (للسكرتيرة).
 */
export default function SoundGate({ lang, part = "banner" }: { lang: Lang; part?: "banner" | "toggle" }) {
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
          className="w-full rounded-2xl bg-amber-100 p-3 text-center font-bold text-amber-900 ring-1 ring-amber-300"
          onClick={async () => {
            if (await unlockAudio()) {
              setReady(true);
              playSound("moved");
            }
          }}
          data-testid="sound-gate"
        >
          🔊 {t(lang, "soundEnable")}
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
