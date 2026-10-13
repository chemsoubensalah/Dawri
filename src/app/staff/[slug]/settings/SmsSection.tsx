"use client";
/**
 * قسم «رسائل SMS من هاتف العيادة» في الإعدادات — مستقلّ بحالته وواجهته (/api/staff/[slug]/sms) وزرّ حفظه.
 * يُعرض داخل نموذج الإعدادات: كلّ الأزرار type="button" وEnter في حقوله لا يرسل النموذج الكبير.
 */
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BatteryCharging,
  ChevronDown,
  CircleCheck,
  CirclePause,
  ClipboardPaste,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  MessageSquareText,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, tn, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import { ConfirmDialog } from "@/components/Dialog";
import type { SmsSettingsView } from "@/lib/server/smsgate";

const APK_URL = "https://github.com/capcom6/android-sms-gateway/releases/latest";
const SITE_URL = "https://sms-gate.app";

type Msg = { ok: boolean; text: string } | null;

/** Enter داخل حقل هذا القسم يشغّل فعله هو، لا حفظ الإعدادات العامّة. */
const onEnter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") {
    e.preventDefault();
    fn();
  }
};

/** «14:05» اليوم، أو «12/10 14:05» — بتوقيت الجزائر. */
function when(iso: string): string {
  const d = new Date(iso);
  const tz = { timeZone: "Africa/Algiers" } as const;
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", tz).format(x);
  const time = new Intl.DateTimeFormat("en-GB", { ...tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  if (day(d) === day(new Date())) return time;
  const dm = new Intl.DateTimeFormat("en-GB", { ...tz, day: "2-digit", month: "2-digit" }).format(d);
  return `${dm} ${time}`;
}

function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3 rounded-2xl bg-slate-50 p-4 text-start ring-1 ring-slate-200/70 transition hover:ring-slate-300 disabled:opacity-50"
    >
      <span className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${on ? "bg-brand-500" : "bg-slate-300"}`}>
        <span className={`absolute size-5 rounded-full bg-white shadow transition-all ${on ? "start-[22px]" : "start-0.5"}`} />
      </span>
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{hint}</span>}
      </span>
    </button>
  );
}

/** هاتف صغير يوضّح أين يجد الطبيب «Cloud server» واسم المستخدم وكلمة السرّ. */
function PhoneMock() {
  return (
    <div className="mx-auto w-44 shrink-0 rounded-[1.9rem] bg-ink p-2 shadow-(--shadow-lift)" dir="ltr" aria-hidden="true">
      <div className="rounded-[1.45rem] bg-white px-3 pt-2.5 pb-3 text-[10px] leading-tight text-slate-600">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-center justify-between font-bold text-ink">
          SMS Gateway <span className="size-2 rounded-full bg-brand-500" />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
          <span className="flex items-center gap-1 font-semibold text-ink">
            <Cloud size={11} /> Cloud server
          </span>
          <span className="relative inline-flex h-3.5 w-6 items-center rounded-full bg-brand-500">
            <span className="absolute left-[11px] size-2.5 rounded-full bg-white" />
          </span>
        </div>
        <div className="mt-1.5 rounded-lg px-2 py-1.5 ring-2 ring-amber-400">
          <div className="text-slate-400">Username</div>
          <div className="num font-bold tracking-wider text-ink">K7QX2M</div>
        </div>
        <div className="mt-1.5 rounded-lg px-2 py-1.5 ring-2 ring-amber-400">
          <div className="text-slate-400">Password</div>
          <div className="font-bold tracking-widest text-ink">••••••••••</div>
        </div>
        <div className="mt-2 rounded-full bg-brand-600 py-1 text-center font-bold text-white">Online</div>
      </div>
    </div>
  );
}

export default function SmsSection({ lang, slug }: { lang: Lang; slug: string }) {
  const url = `/api/staff/${slug}/sms`;
  const router = useRouter();
  const [view, setView] = useState<SmsSettingsView | null>(null);
  const [loadError, setLoadError] = useState(false);
  // الحقول
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [editCreds, setEditCreds] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [sendCalled, setSendCalled] = useState(true);
  const [sendSoon, setSendSoon] = useState(true);
  const [sendCodes, setSendCodes] = useState(true);
  const [testPhone, setTestPhone] = useState("");
  // الحالة
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [testMsg, setTestMsg] = useState<Msg>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const apply = useCallback((v: SmsSettingsView) => {
    setView(v);
    setUsername(v.username);
    setBaseUrl(v.baseUrl);
    setAdvanced(v.baseUrl !== v.defaultBaseUrl);
    setEnabled(v.configured ? v.enabled : true);
    setSendCalled(v.sendCalled);
    setSendSoon(v.sendSoon);
    setSendCodes(v.sendCodes);
    setPassword("");
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await api<SmsSettingsView>(url));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [apply, url]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!view || busy) return;
    setBusy("save");
    setMsg(null);
    try {
      const credsOpen = !view.configured || editCreds;
      const v = await api<SmsSettingsView>(url, {
        action: "save",
        enabled,
        sendCalled,
        sendSoon,
        sendCodes,
        ...(credsOpen ? { username, baseUrl, password: password || undefined } : {}),
      });
      apply(v);
      setEditCreds(false);
      setShowPass(false);
      setMsg({ ok: true, text: t(lang, "saved") });
      router.refresh(); // قناة SMS في قسم «التنبيهات»
    } catch (err) {
      setMsg({ ok: false, text: errorText(lang, (err as ApiError).code) });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    if (!view || busy || !testPhone.trim()) return;
    setBusy("test");
    setTestMsg(null);
    try {
      const r = await api<{ ok: boolean; view: SmsSettingsView }>(url, { action: "test", to: testPhone, lang });
      setView(r.view);
      setTestMsg({ ok: true, text: t(lang, "sg_testOk") });
    } catch (err) {
      setTestMsg({ ok: false, text: errorText(lang, (err as ApiError).code) });
      const fresh = await api<SmsSettingsView>(url).catch(() => null);
      if (fresh) setView(fresh);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setMsg(null);
    try {
      apply(await api<SmsSettingsView>(url, { action: "remove" }));
      setEditCreds(false);
      setTestMsg(null);
      setMsg({ ok: true, text: t(lang, "sg_removed") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(lang, (err as ApiError).code) });
    } finally {
      setBusy(null);
    }
  };

  const msgLine = (m: Msg) =>
    m && (
      <p className={`text-sm font-semibold ${m.ok ? "text-brand-700" : "text-rose-700"}`} role="status">
        {m.text}
      </p>
    );

  // ——— حقول بيانات الربط (أوّل مرّة، أو «تغيير بيانات الربط») ———
  const credsFields = view && (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="sg-user">{t(lang, "sg_username")}</label>
        <input
          id="sg-user"
          className="input num text-start"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={onEnter(save)}
          placeholder="K7QX2M"
        />
      </div>
      <div>
        <label className="label" htmlFor="sg-pass">{t(lang, "sg_password")}</label>
        <div className="relative">
          <input
            id="sg-pass"
            className="input num pe-12 text-start"
            dir="ltr"
            type={showPass ? "text" : "password"}
            autoComplete="new-password"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onEnter(save)}
            placeholder={view.hasPassword ? t(lang, "sg_passwordKeep") : ""}
          />
          <button
            type="button"
            onClick={() => setShowPass((s) => !s)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t(lang, showPass ? "sg_hide" : "sg_show")}
          >
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      <div className="sm:col-span-2">
        <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-ink" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
          <ChevronDown size={16} className={`transition ${advanced ? "rotate-180" : ""}`} /> {t(lang, "sg_advanced")}
        </button>
        {advanced && (
          <div className="mt-2">
            <label className="label" htmlFor="sg-url">{t(lang, "sg_baseUrl")}</label>
            <div className="flex gap-2">
              <input
                id="sg-url"
                className="input text-start text-sm"
                dir="ltr"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                maxLength={200}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onKeyDown={onEnter(save)}
              />
              <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setBaseUrl(view.defaultBaseUrl)}>
                {t(lang, "sg_resetUrl")}
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{t(lang, "sg_baseUrlHint")}</p>
          </div>
        )}
      </div>
    </div>
  );

  // ——— نصائح التشغيل (هاتف موصول، توفير البطارية، الخصوصية) ———
  const tips = (
    <details className="group rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-100">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-amber-900 [&::-webkit-details-marker]:hidden">
        <BatteryCharging size={18} /> {t(lang, "sg_tipsTitle")}
        <ChevronDown size={18} className="ms-auto text-amber-700 transition group-open:rotate-180" />
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-amber-900/90">
        {(["sg_tip1", "sg_tip2", "sg_tip3", "sg_tip4", "sg_tip5"] as DictKey[]).map((k) => (
          <li key={k}>{t(lang, k)}</li>
        ))}
      </ul>
    </details>
  );

  const steps: { icon: ReactNode; title: DictKey; hint: DictKey; extra?: ReactNode }[] = [
    {
      icon: <Download size={18} />,
      title: "sg_step1",
      hint: "sg_step1Hint",
      extra: (
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={APK_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
            <Download size={15} /> {t(lang, "sg_download")}
          </a>
          <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" dir="ltr">
            <ExternalLink size={15} /> {t(lang, "sg_moreInfo")}
          </a>
        </div>
      ),
    },
    { icon: <Cloud size={18} />, title: "sg_step2", hint: "sg_step2Hint" },
    { icon: <Copy size={18} />, title: "sg_step3", hint: "sg_step3Hint" },
    { icon: <ClipboardPaste size={18} />, title: "sg_step4", hint: "sg_step4Hint" },
  ];

  const status = view?.configured ? (view.enabled ? view.status : "paused") : null;
  const statusBox =
    view &&
    status &&
    {
      ok: { cls: "bg-brand-50 text-brand-900 ring-brand-200", icon: <CircleCheck size={22} className="text-brand-600" />, title: t(lang, "sg_statusOk"), body: null },
      error: {
        cls: "bg-rose-50 text-rose-900 ring-rose-200",
        icon: <TriangleAlert size={22} className="text-rose-600" />,
        title: t(lang, "sg_statusError"),
        body: errorText(lang, `sg_${view.lastError}`),
      },
      unknown: { cls: "bg-amber-50 text-amber-900 ring-amber-200", icon: <TriangleAlert size={22} className="text-amber-600" />, title: t(lang, "sg_statusUnknown"), body: null },
      off: { cls: "bg-slate-50 text-slate-700 ring-slate-200", icon: <CirclePause size={22} className="text-slate-400" />, title: t(lang, "sg_statusPaused"), body: null },
      paused: { cls: "bg-slate-50 text-slate-700 ring-slate-200", icon: <CirclePause size={22} className="text-slate-400" />, title: t(lang, "sg_statusPaused"), body: null },
    }[status];

  return (
    <section id="sms" className="card scroll-mt-28 p-6" data-testid="sms-section">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <MessageSquareText size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
            {t(lang, "sg_title")}
            <span className="chip bg-brand-50 text-brand-800 ring-1 ring-brand-200/70">{t(lang, "sg_badgeFree")}</span>
          </h2>
          <p className="text-sm leading-relaxed text-slate-500">{t(lang, "sg_sub")}</p>
        </div>
      </div>

      {!view ? (
        loadError ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
            {errorText(lang, "network")}
            <button type="button" className="btn-secondary btn-sm" onClick={load}>
              ↻
            </button>
          </div>
        ) : (
          <div className="space-y-3" aria-busy="true" aria-label={t(lang, "sg_loading")}>
            <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        )
      ) : !view.configured ? (
        /* ——————— أوّل مرّة: لماذا + الدليل + الربط ——————— */
        <div className="space-y-6">
          <ul className="grid gap-2 sm:grid-cols-3">
            {(["sg_why1", "sg_why2", "sg_why3"] as DictKey[]).map((k) => (
              <li key={k} className="flex items-start gap-2 rounded-2xl bg-brand-50/60 p-3 text-sm leading-relaxed text-brand-900 ring-1 ring-brand-100">
                <CircleCheck size={17} className="mt-0.5 shrink-0 text-brand-600" />
                {t(lang, k)}
              </li>
            ))}
          </ul>

          <div>
            <h3 className="mb-3 font-bold text-ink">{t(lang, "sg_guideTitle")}</h3>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <ol className="flex-1">
                {steps.map((s, i) => (
                  <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < steps.length - 1 && <span className="absolute start-[19px] top-10 bottom-0 w-px bg-brand-200" aria-hidden="true" />}
                    <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-(--shadow-brand)">
                      {s.icon}
                      <span className="num absolute -end-1 -top-1 inline-flex size-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-brand-700 ring-1 ring-brand-200">
                        {i + 1}
                      </span>
                    </span>
                    <div className="min-w-0 pt-1.5">
                      <div className="font-semibold text-ink">{t(lang, s.title)}</div>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{t(lang, s.hint)}</p>
                      {s.extra}
                    </div>
                  </li>
                ))}
              </ol>
              <PhoneMock />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
            {credsFields}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary" onClick={save} disabled={busy !== null || !username.trim() || !password.trim()}>
                <Link2 size={18} /> {busy === "save" ? t(lang, "sg_connecting") : t(lang, "sg_connect")}
              </button>
              {msgLine(msg)}
            </div>
          </div>

          {tips}

          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" /> {t(lang, "sg_privacy")}
          </p>
        </div>
      ) : (
        /* ——————— مربوط: الحالة + الأحداث + التجربة ——————— */
        <div className="space-y-5">
          {statusBox && (
            <div className={`rounded-2xl p-4 ring-1 ${statusBox.cls}`} data-testid="sms-status">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">{statusBox.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{statusBox.title}</div>
                  {statusBox.body && <p className="mt-0.5 text-sm leading-relaxed">{statusBox.body}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80">
                    {view.deviceName && (
                      <span className="inline-flex items-center gap-1">
                        <Smartphone size={14} /> {t(lang, "sg_device", { d: "" })}
                        <bdi dir="ltr">{view.deviceName}</bdi>
                      </span>
                    )}
                    <span>{view.sentThisMonth === 0 ? t(lang, "sg_sentMonth_zero") : tn(lang, "sg_sentMonth", view.sentThisMonth)}</span>
                    {view.lastOkAt && (
                      <span>
                        {t(lang, "sg_lastOk", { t: "" })}
                        <span dir="ltr" className="num">{when(view.lastOkAt)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <Switch on={enabled} onChange={setEnabled} label={t(lang, "sg_enabled")} hint={t(lang, "sg_enabledHint")} />

          <div>
            <div className="mb-2 text-sm font-semibold text-slate-600">{t(lang, "sg_events")}</div>
            <div className={`grid gap-2 ${view.codesActive ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {(
                [
                  ["sg_evCalled", "sg_evCalledHint", sendCalled, setSendCalled],
                  ["sg_evSoon", "sg_evSoonHint", sendSoon, setSendSoon],
                  ...(view.codesActive ? [["sg_evCodes", "sg_evCodesHint", sendCodes, setSendCodes]] : []),
                ] as [DictKey, DictKey, boolean, (v: boolean) => void][]
              ).map(([k, h, on, set]) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 transition ${
                    on && enabled ? "bg-brand-50/60 ring-brand-200" : "bg-slate-50 ring-slate-200/70"
                  } ${enabled ? "" : "opacity-60"}`}
                >
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-600" checked={on} disabled={!enabled} onChange={(e) => set(e.target.checked)} />
                  <span>
                    <span className="block font-semibold text-ink">{t(lang, k)}</span>
                    <span className="block text-xs leading-relaxed text-slate-500">{t(lang, h)}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{t(lang, view.fallback ? "sg_fallbackOn" : "sg_fallbackOff")}</p>
          </div>

          {editCreds ? (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">{credsFields}</div>
          ) : (
            <button type="button" className="btn-ghost btn-sm text-slate-600" onClick={() => setEditCreds(true)}>
              <Link2 size={15} /> {t(lang, "sg_editCreds")}
            </button>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy !== null}>
              <Save size={18} /> {busy === "save" ? "…" : t(lang, "sg_save")}
            </button>
            {msgLine(msg)}
          </div>

          {/* ——— رسالة تجريبية ——— */}
          <div className="border-t border-slate-100 pt-5">
            <h3 className="font-bold text-ink">{t(lang, "sg_testTitle")}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{t(lang, "sg_testHint")}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="input num text-start sm:max-w-xs"
                dir="ltr"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder={t(lang, "phonePlaceholder")}
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                onKeyDown={onEnter(test)}
                aria-label={t(lang, "sg_testTitle")}
              />
              <button type="button" className="btn-secondary" onClick={test} disabled={busy !== null || !testPhone.trim() || view.testsLeft === 0}>
                <Send size={17} className="rtl:-scale-x-100" /> {busy === "test" ? "…" : t(lang, "sg_testSend")}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs text-slate-500">{t(lang, "sg_testsLeft", { n: view.testsLeft })}</span>
              {msgLine(testMsg)}
            </div>
          </div>

          {tips}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex max-w-xl items-start gap-2 text-xs leading-relaxed text-slate-500">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" /> {t(lang, "sg_privacy")}
            </p>
            <button type="button" className="btn-ghost btn-sm text-rose-700 hover:bg-rose-50" onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
              <Trash2 size={15} /> {t(lang, "sg_remove")}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={t(lang, "sg_removeTitle")}
        body={t(lang, "sg_removeBody")}
        confirmLabel={t(lang, "sg_remove")}
        cancelLabel={t(lang, "cancel")}
        danger
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </section>
  );
}
