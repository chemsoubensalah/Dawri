import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** أيقونات PNG للهواتف (نفس شعار «دوري»). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("not found", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #10b981, #047857)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="13" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="4.5" />
          <path d="M24 11a13 13 0 1 1-12.36 8.98" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="24" cy="24" r="4" fill="#fff" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": `public, max-age=${86400 * 30}, immutable` } },
  );
}
