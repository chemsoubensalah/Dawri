"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** نافذة منبثقة مبنيّة على <dialog> الأصلي (تعمل بلوحة المفاتيح وزرّ الرجوع). */
export default function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
  closeLabel = "×",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // التركيز على أوّل حقل (وإلّا يذهب إلى زرّ الإغلاق فيُغلق Enter النافذة)
      d.querySelector<HTMLElement>("[autofocus],[data-autofocus],input,select,textarea")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-xl" : "max-w-md"} rounded-3xl bg-white p-0 text-ink shadow-(--shadow-lift) backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm open:animate-fade-up`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={closeLabel}>
          <X size={20} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

/** نافذة تأكيد بدل confirm() الخاصّ بالمتصفّح. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onClose,
  closeLabel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} closeLabel={closeLabel}>
      {body && <div className="mb-5 text-slate-600">{body}</div>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? "btn bg-rose-600 text-white hover:bg-rose-700" : "btn-primary"}
          onClick={() => {
            onConfirm();
            onClose();
          }}
          data-testid="confirm-yes"
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
