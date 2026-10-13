import Link from "next/link";
import { SearchX } from "lucide-react";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="bg-mesh flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <Logo size={36} />
      <div className="card max-w-sm p-8">
        <SearchX size={44} className="mx-auto text-slate-300" />
        <div className="num mt-3 text-5xl font-bold text-brand-700">404</div>
        <p className="mt-2 text-lg font-semibold">الصفحة غير موجودة</p>
        <p className="text-slate-500" dir="ltr">Page introuvable</p>
        <p className="mt-3 text-sm text-slate-500">تأكّد من الرابط أو امسح رمز QR الموجود على باب العيادة.</p>
        <Link href="/" className="btn-secondary mt-5 w-full">العودة للرئيسية · Accueil</Link>
      </div>
    </main>
  );
}
