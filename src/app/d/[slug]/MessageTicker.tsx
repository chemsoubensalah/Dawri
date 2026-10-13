"use client";
import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";

/**
 * شريط رسائل الطبيب أسفل شاشة القاعة: رسالة واحدة في كلّ مرّة، تتبدّل كلّ 9 ثوانٍ
 * (أوضح من النصّ المتحرّك بالعربية، وأخفّ على أجهزة التلفاز الضعيفة).
 */
export default function MessageTicker({ messages }: { messages: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % messages.length), 9000);
    return () => clearInterval(id);
  }, [messages.length]);
  const idx = i % messages.length;
  return (
    <div className="dw-ticker flex items-center gap-4 bg-brand-900 px-6 text-white sm:px-10" role="marquee" aria-live="off">
      <span className="inline-flex size-[calc(var(--tk)*0.62)] shrink-0 items-center justify-center rounded-full bg-amber-400 text-brand-950">
        <Lightbulb className="size-[55%]" />
      </span>
      <p key={idx} className="min-w-0 flex-1 animate-fade-up text-[clamp(1rem,2.6vh,2.1rem)] leading-snug font-semibold line-clamp-2">
        {messages[idx]}
      </p>
      {messages.length > 1 && (
        <span className="hidden shrink-0 gap-1.5 sm:flex" aria-hidden>
          {messages.map((_, j) => (
            <span key={j} className={`size-2 rounded-full ${j === idx ? "bg-amber-400" : "bg-white/25"}`} />
          ))}
        </span>
      )}
    </div>
  );
}
