"use client";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client";

export default function LogoutButton({ slug, label }: { slug: string; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-full text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-rose-600"
      onClick={async () => {
        await api(`/api/staff/${slug}/logout`, {}).catch(() => {});
        location.href = `/staff/${slug}`;
      }}
    >
      <LogOut size={16} />
    </button>
  );
}
