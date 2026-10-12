import { LogoMark } from "@/components/ui";

/** شاشة تحميل فورية (تظهر قبل وصول الصفحة من الخادم) — CSS فقط، بلا JavaScript. */
export default function Loading() {
  return (
    <div className="bg-mesh flex min-h-dvh flex-col items-center justify-center gap-5" role="status" aria-label="…">
      <div className="relative">
        <span className="absolute -inset-3 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600 [animation-duration:0.9s]" />
        <LogoMark size={56} />
      </div>
      <div className="flex items-center gap-2 text-lg font-bold text-ink">
        دوري <span className="text-slate-300">·</span> <span className="tracking-wide text-slate-500">Dawri</span>
      </div>
      <span className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </div>
  );
}
