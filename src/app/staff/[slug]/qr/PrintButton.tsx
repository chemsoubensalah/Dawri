"use client";
import { Printer } from "lucide-react";

export default function PrintButton({ label }: { label: string }) {
  return (
    <button className="btn-primary" onClick={() => window.print()}>
      <Printer size={18} /> {label}
    </button>
  );
}
