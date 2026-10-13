"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** يعدّ الزيارة (مجهولة الهويّة) لإحصائيات لوحة المؤسّس: طلب واحد صغير لكلّ صفحة، لا كوكي. */
export default function VisitBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path || path.startsWith("/admin")) return;
    try {
      const body = JSON.stringify({ p: path, r: document.referrer, q: new URLSearchParams(location.search).has("c") });
      if (!navigator.sendBeacon?.("/api/v", body)) fetch("/api/v", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch {}
  }, [path]);
  return null;
}
