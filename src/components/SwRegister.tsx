"use client";
import { useEffect } from "react";

/** يسجّل عامل الخدمة (للتنبيهات ولتثبيت التطبيق اختيارياً). */
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
