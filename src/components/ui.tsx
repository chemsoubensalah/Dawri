/** مكوّنات واجهة مشتركة (بلا حالة — تعمل في الخادم والمتصفّح). */
import { useId, type ReactNode } from "react";

/** شعار «دوري»: دائرة تقدّم (الطابور يتحرّك) داخل مربّع أخضر. */
export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  // معرّف فريد لكلّ شعار: لو تكرّر «dawri-g» وكان أوّل شعار مخفيّاً، تختفي خلفية الشعارات الأخرى
  const gid = `dawri-g-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--color-brand-500)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-brand-700)" }} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gid})`} />
      <circle cx="24" cy="24" r="13" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="4.5" />
      <path d="M24 11a13 13 0 1 1-12.36 8.98" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="4" fill="#fff" />
    </svg>
  );
}

export function Logo({ size = 36, sub = true, invert = false }: { size?: number; sub?: boolean; invert?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-none">
        <span className={`block text-xl font-bold tracking-tight ${invert ? "text-white" : "text-ink"}`}>دوري</span>
        {sub && (
          <span className={`mt-1 block text-[11px] font-medium tracking-[0.18em] ${invert ? "text-brand-200" : "text-brand-700"}`}>
            DAWRI
          </span>
        )}
      </span>
    </span>
  );
}

type Tone = "slate" | "green" | "amber" | "sky" | "rose" | "violet";
const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-brand-50 text-brand-800 ring-1 ring-brand-200/70",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70",
  sky: "bg-sky-50 text-sky-800 ring-1 ring-sky-200/70",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/70",
  violet: "bg-violet-50 text-violet-800 ring-1 ring-violet-200/70",
};

export function Chip({ tone = "slate", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`chip ${TONES[tone]} ${className}`}>{children}</span>;
}

/** نقطة حيّة نابضة (مفتوح/مباشر). */
export function LiveDot({ on = true }: { on?: boolean }) {
  return (
    <span className="relative inline-flex size-2.5">
      {on && <span className="absolute inset-0 animate-ping rounded-full bg-brand-400 opacity-60" />}
      <span className={`relative inline-flex size-2.5 rounded-full ${on ? "bg-brand-500" : "bg-slate-400"}`} />
    </span>
  );
}

/** دائرة بالأحرف الأولى من الاسم. */
export function Avatar({ name, size = 40, tone = "green" }: { name: string; size?: number; tone?: "green" | "slate" | "amber" }) {
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  const tones = {
    green: "bg-brand-100 text-brand-800",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${tones[tone]}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials.toUpperCase()}
    </span>
  );
}

export function IconBubble({ children, tone = "green", size = "md" }: { children: ReactNode; tone?: Tone; size?: "md" | "lg" }) {
  const s = size === "lg" ? "size-14 rounded-2xl" : "size-11 rounded-xl";
  return <span className={`inline-flex shrink-0 items-center justify-center ${s} ${TONES[tone]}`}>{children}</span>;
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200/60">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <div className="num mt-1 text-2xl font-bold text-ink">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, sub, center = false }: { eyebrow?: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : ""}>
      {eyebrow && <div className="mb-2 text-sm font-semibold text-brand-700">{eyebrow}</div>}
      <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">{sub}</p>}
    </div>
  );
}

export function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="text-slate-300">{icon}</span>
      <div className="font-semibold text-slate-500">{title}</div>
      {sub && <div className="max-w-xs text-sm text-slate-500">{sub}</div>}
    </div>
  );
}
