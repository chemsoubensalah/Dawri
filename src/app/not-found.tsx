import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-8 text-center">
      <div className="text-6xl font-black text-brand-700">404</div>
      <p className="text-xl font-semibold">غير موجود · Introuvable</p>
      <Link href="/" className="btn-secondary">دوري · Dawri</Link>
    </main>
  );
}
