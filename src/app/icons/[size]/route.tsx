import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** أيقونات PNG للهواتف (تُولَّد مرّة ثمّ تُخزَّن مؤقّتاً). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size} height={size} viewBox="0 0 512 512">
          <circle cx="256" cy="256" r="150" fill="none" stroke="#fff" strokeWidth="36" />
          <path d="M256 160v104l64 40" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": `public, max-age=${86400 * 30}, immutable` } },
  );
}
