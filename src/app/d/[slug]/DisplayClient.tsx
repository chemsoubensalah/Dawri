"use client";
import { useEffect, useRef, useState } from "react";
import type { DisplayStyle, Lang, ShopLook } from "@/lib/domain/types";
import { dirOf, drTitle, t } from "@/lib/i18n";
import { api, playSound, unlockAudio, usePoll } from "@/lib/client";
import { themeVars } from "@/lib/theme";
import type { PublicShopView } from "@/lib/server/service";
import { LAYOUTS } from "./layouts";

const VOICE_KEY = "dawri:voice";

/** نداء صوتي بالمتصفّح (إن توفّر صوت للغة على الجهاز). */
function announce(lang: Lang, n: number) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(t(lang, "dp_say", { n }));
    u.lang = lang === "ar" ? "ar-SA" : "fr-FR";
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
    if (v) u.voice = v;
    u.rate = 0.9;
    synth.cancel();
    setTimeout(() => synth.speak(u), 1200); // بعد «دينغ-دونغ»
  } catch {}
}

/** غلاف شاشة القاعة: البيانات الحيّة، الساعة، الأصوات والنداء — والتصميم المختار يرسم الباقي. */
export default function DisplayClient({
  lang,
  initial,
  qr,
  preview = {},
}: {
  lang: Lang;
  initial: PublicShopView;
  qr: string;
  /** معاينة من الإعدادات قبل الحفظ (?style=…&theme=…&custom=…) */
  preview?: { skin?: DisplayStyle; look?: Pick<ShopLook, "theme" | "custom"> };
}) {
  const [v, setV] = useState(initial);
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [voice, setVoice] = useState(false);
  // نداء ملء الشاشة لبضع ثوانٍ عند تغيّر الرقم
  const [callout, setCallout] = useState<number | null>(null);
  const last = useRef(initial.currentNumber);

  usePoll(async () => setV(await api<PublicShopView>(`/api/s/${v.slug}`)), 4000);

  useEffect(() => {
    try {
      setVoice(localStorage.getItem(VOICE_KEY) === "1");
    } catch {}
    const tz = "Africa/Algiers";
    const fmt = new Intl.DateTimeFormat("fr-DZ", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    const fmtDate = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
    const tick = () => {
      const d = new Date();
      setTime(fmt.format(d));
      setDate(fmtDate.format(d));
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [lang]);

  useEffect(() => {
    if (v.currentNumber !== last.current && v.currentNumber !== null) {
      playSound("next");
      if (voice) announce(lang, v.currentNumber);
      setCallout(v.currentNumber);
      const id = setTimeout(() => setCallout(null), 6000);
      last.current = v.currentNumber;
      return () => clearTimeout(id);
    }
    last.current = v.currentNumber;
  }, [v.currentNumber, voice, lang]);

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    try {
      localStorage.setItem(VOICE_KEY, on ? "1" : "0");
    } catch {}
    unlockAudio();
    if (on && v.currentNumber !== null) announce(lang, v.currentNumber);
  };

  // بلا معاينة: يتبع ما يحفظه الطبيب (يتحدّث على التلفاز دون إعادة تحميل)
  const skin = preview.skin ?? v.look.display;
  const { Layout } = LAYOUTS[skin] ?? LAYOUTS.night;

  return (
    <div dir={dirOf(lang)} lang={lang} style={themeVars(preview.look ?? v.look)} data-skin={skin}>
      <Layout
        lang={lang}
        v={v}
        doctor={drTitle(lang, v.kind, v.profile.doctorName)}
        time={time}
        date={date}
        qr={qr}
        callout={callout}
        dismissCallout={() => setCallout(null)}
        voice={voice}
        toggleVoice={toggleVoice}
      />
    </div>
  );
}
