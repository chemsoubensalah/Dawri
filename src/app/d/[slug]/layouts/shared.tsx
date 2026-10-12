"use client";
import { Maximize2, Stethoscope, Volume2, VolumeX } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

export type Tone = "dark" | "light";

/** زرّا النداء الصوتي وملء الشاشة — يضعهما كلّ تصميم في مكان هادئ (عادةً التذييل). */
export function Controls({
  lang,
  voice,
  toggleVoice,
  tone,
  className = "",
}: {
  lang: Lang;
  voice: boolean;
  toggleVoice: () => void;
  tone: Tone;
  className?: string;
}) {
  const btn = `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ring-1 transition ${
    tone === "dark" ? "ring-white/20 hover:bg-white/10" : "ring-slate-300 hover:bg-white"
  }`;
  return (
    <span className={`flex gap-2 ${className}`}>
      <button type="button" className={btn} onClick={toggleVoice} aria-pressed={voice}>
        {voice ? <Volume2 size={16} /> : <VolumeX size={16} />} {t(lang, "dp_voice")}
      </button>
      <button type="button" className={btn} onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
        <Maximize2 size={16} /> {t(lang, "dp_full")}
      </button>
    </span>
  );
}

/** رمز QR في إطار أبيض (يجب أن يبقى أبيض كي يُمسح). */
export function Qr({ svg, className = "" }: { svg: string; className?: string }) {
  return <div className={`shrink-0 rounded-xl bg-white p-1.5 ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** نداء ملء الشاشة الافتراضي — يمكن لأيّ تصميم أن يرسم نداءه الخاصّ بدلاً منه. */
export function CalloutOverlay({
  lang,
  n,
  doctor,
  onClose,
  variant = "dark",
}: {
  lang: Lang;
  n: number;
  doctor: string | null;
  onClose: () => void;
  variant?: "dark" | "light" | "color";
}) {
  const bg =
    variant === "light"
      ? "bg-white text-ink"
      : variant === "color"
        ? "bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-800))] text-white"
        : "bg-[radial-gradient(circle_at_50%_40%,var(--color-brand-800),#020a10_75%)] text-white";
  const num =
    variant === "light"
      ? "text-brand-600 drop-shadow-[0_20px_50px_color-mix(in_srgb,var(--color-brand-500)_35%,transparent)]"
      : variant === "color"
        ? "text-white drop-shadow-[0_20px_60px_rgb(0_0_0/0.3)]"
        : "text-white drop-shadow-[0_20px_60px_color-mix(in_srgb,var(--color-brand-500)_55%,transparent)]";
  const label = variant === "light" ? "text-brand-700" : variant === "color" ? "text-white/85" : "text-brand-200";
  const chip = variant === "light" ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200" : variant === "color" ? "bg-white/15 text-white" : "bg-white/10 text-brand-100";
  return (
    <div role="alert" className={`fixed inset-0 z-50 flex animate-fade-up flex-col items-center justify-center gap-4 px-6 text-center ${bg}`} onClick={onClose}>
      <div className={`text-[clamp(1.8rem,4vw,3.5rem)] font-bold ${label}`}>{t(lang, "dp_number")}</div>
      <div className={`num animate-pop text-[min(55vw,55vh)] leading-[0.9] font-bold ${num}`}>{n}</div>
      <div className="text-[clamp(1.8rem,4.5vw,4rem)] font-bold">{t(lang, "dp_enter")}</div>
      {doctor && (
        <div className={`mt-2 inline-flex items-center gap-3 rounded-full px-6 py-3 text-[clamp(1.2rem,2.6vw,2.2rem)] font-semibold ${chip}`}>
          <Stethoscope size={28} /> {doctor}
        </div>
      )}
    </div>
  );
}
