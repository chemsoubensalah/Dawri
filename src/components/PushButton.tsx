"use client";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import { api } from "@/lib/client";

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unknown" | "unsupported" | "default" | "granted" | "denied";

/** زرّ تفعيل تنبيهات Web Push لهذه التذكرة. */
export default function PushButton({ lang, ticketId, pushKey }: { lang: Lang; ticketId: string; pushKey: string | null }) {
  const [state, setState] = useState<State>("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      // نربط الاشتراك الموجود بهذه التذكرة
      subscribe().catch(() => setState("default"));
    } else {
      setState(Notification.permission === "denied" ? "denied" : "default");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushKey, ticketId]);

  async function subscribe() {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(pushKey!) }));
    await api(`/api/t/${ticketId}/push`, sub.toJSON());
    setState("granted");
  }

  async function enable() {
    setBusy(true);
    try {
      const p = await Notification.requestPermission();
      if (p === "granted") await subscribe();
      else setState(p === "denied" ? "denied" : "default");
    } catch {
      setState("default");
    } finally {
      setBusy(false);
    }
  }

  if (state === "unknown") return null;
  if (state === "unsupported") return <p className="text-center text-sm text-slate-600">{t(lang, "alertsUnsupported")}</p>;
  if (state === "denied") return <p className="text-center text-sm text-amber-700">{t(lang, "alertsBlocked")}</p>;
  if (state === "granted") return <p className="text-center font-semibold text-brand-700">{t(lang, "alertsOn")}</p>;
  return (
    <button className="btn-secondary w-full" onClick={enable} disabled={busy}>
      🔔 {t(lang, "enableAlerts")}
    </button>
  );
}
