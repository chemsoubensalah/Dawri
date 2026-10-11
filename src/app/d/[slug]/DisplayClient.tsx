"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import SoundGate from "@/components/SoundGate";
import { api, playSound, usePoll } from "@/lib/client";
import type { PublicShopView } from "@/lib/server/service";

export default function DisplayClient({ lang, initial }: { lang: Lang; initial: PublicShopView }) {
  const [v, setV] = useState(initial);
  const last = useRef(initial.currentNumber);
  usePoll(async () => setV(await api<PublicShopView>(`/api/s/${v.slug}`)), 5000);
  useEffect(() => {
    if (v.currentNumber !== last.current && v.currentNumber !== null) playSound("next");
    last.current = v.currentNumber;
  }, [v.currentNumber]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-slate-900 p-6 text-white">
      <div className="w-full max-w-md">
        <SoundGate lang={lang} />
      </div>
      <h1 className="text-3xl font-bold text-slate-300">{v.name}</h1>
      <div className="text-center">
        <div className="text-2xl text-brand-500">{t(lang, "displayNow")}</div>
        <div className="num text-[min(40vw,22rem)] font-black leading-none">{v.currentNumber ?? "—"}</div>
      </div>
      {v.nextNumbers.length > 0 && (
        <div className="text-center">
          <div className="text-xl text-slate-400">{t(lang, "displayNext")}</div>
          <div className="num flex gap-6 text-5xl font-bold text-slate-300">
            {v.nextNumbers.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>
      )}
      <div className="text-lg text-slate-500">{t(lang, "appName")}</div>
    </main>
  );
}
