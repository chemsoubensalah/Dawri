import { LogoMark } from "@/components/ui";

/** تحميل شاشة القاعة: داكن كي لا يومض التلفاز بالأبيض. */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#061420]" role="status" aria-label="…">
      <div className="relative">
        <span className="absolute -inset-4 animate-spin rounded-full border-4 border-white/10 border-t-brand-400 [animation-duration:0.9s]" />
        <LogoMark size={72} />
      </div>
      <div className="text-2xl font-bold text-white">
        دوري <span className="text-white/30">·</span> <span className="text-white/60">Dawri</span>
      </div>
    </div>
  );
}
