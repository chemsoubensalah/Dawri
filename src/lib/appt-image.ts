/**
 * صورة الموعد (PNG) تُرسم على الهاتف نفسه — يحفظها المريض في معرض الصور أو يرسلها.
 * Canvas يشكّل العربية ويتّجه يميناً بشكل صحيح (عكس مولّدات الصور على الخادم)،
 * ويستعمل خطّ الصفحة المحمَّل أصلاً: لا شيء إضافيّ يُنزَّل غير مكتبة QR (عند الضغط فقط).
 */

export interface ApptImage {
  rtl: boolean;
  /** عنصر داخل الصفحة: نقرأ منه ألوان العيادة والخطّ */
  themeFrom: Element;
  shop: string;
  title: string;
  date: string;
  time: string;
  /** [العنوان، القيمة، قيمة بأرقام لاتينية تُرسم من اليسار (هاتف، ساعة)] */
  rows: [string, string, boolean?][];
  url: string;
  scanText: string;
  footer: string;
}

const W = 1080;
const PAD = 72;

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  if (!v) return fallback;
  // صيغة لا يفهمها Canvas (نادر) ← يبقى اللون الاحتياطي
  const c = document.createElement("canvas").getContext("2d")!;
  c.fillStyle = fallback;
  c.fillStyle = v;
  return c.fillStyle as string;
}

/** يقصّ النصّ بـ «…» ليتّسع في العرض المتاح. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function appointmentImage(o: ApptImage): Promise<Blob> {
  await document.fonts?.ready;
  const family = getComputedStyle(o.themeFrom).fontFamily || "system-ui, sans-serif";
  const brand = cssColor(o.themeFrom, "--color-brand-600", "#059669");
  const brandDark = cssColor(o.themeFrom, "--color-brand-800", "#065f46");

  const ROW = 96;
  const QR = 300;
  const cardTop = 600;
  const cardH = 40 + o.rows.length * ROW + 40 + QR + 110;
  const H = cardTop + cardH + 130;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;
  const dir = o.rtl ? "rtl" : "ltr";
  const startX = o.rtl ? W - PAD : PAD;
  const endX = o.rtl ? PAD : W - PAD;
  const startAlign: CanvasTextAlign = o.rtl ? "right" : "left";
  const endAlign: CanvasTextAlign = o.rtl ? "left" : "right";

  ctx.fillStyle = "#f5f7fa";
  ctx.fillRect(0, 0, W, H);

  // ——— الشريط الملوّن: العيادة، التاريخ، الساعة ———
  const g = ctx.createLinearGradient(0, 0, W, cardTop + 80);
  g.addColorStop(0, brand);
  g.addColorStop(1, brandDark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, cardTop + 80);

  ctx.direction = dir;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = font(600, 38);
  ctx.textAlign = startAlign;
  ctx.fillText(fit(ctx, o.shop, W - 2 * PAD), startX, 104);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = font(500, 40);
  ctx.fillText(o.title, W / 2, 215);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 64);
  ctx.fillText(fit(ctx, o.date, W - 2 * PAD), W / 2, 305);
  ctx.direction = "ltr";
  ctx.font = font(700, 200);
  ctx.fillText(o.time, W / 2, 505);
  ctx.direction = dir;

  // ——— البطاقة البيضاء: التفاصيل ثمّ رمز QR ———
  ctx.save();
  ctx.shadowColor = "rgba(15,23,42,0.12)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, PAD - 24, cardTop, W - 2 * (PAD - 24), cardH, 44);
  ctx.fill();
  ctx.restore();

  let y = cardTop + 40;
  o.rows.forEach(([k, v, ltr], i) => {
    const base = y + ROW / 2 + 13;
    ctx.textAlign = startAlign;
    ctx.fillStyle = "#64748b";
    ctx.font = font(500, 34);
    ctx.fillText(k, startX, base);
    const labelW = ctx.measureText(k).width;
    ctx.textAlign = endAlign;
    ctx.fillStyle = "#0f172a";
    ctx.font = font(700, 38);
    if (ltr) ctx.direction = "ltr";
    ctx.fillText(fit(ctx, v, W - 2 * PAD - labelW - 40), endX, base);
    ctx.direction = dir;
    if (i < o.rows.length - 1) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(PAD, y + ROW - 1, W - 2 * PAD, 2);
    }
    y += ROW;
  });

  y += 40;
  const QRCode = (await import("qrcode")).default;
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, o.url, { margin: 1, width: QR, color: { dark: "#0f172a", light: "#ffffff" } });
  ctx.drawImage(qr, (W - QR) / 2, y, QR, QR);
  y += QR + 62;
  ctx.textAlign = "center";
  ctx.fillStyle = "#475569";
  ctx.font = font(500, 32);
  ctx.fillText(o.scanText, W / 2, y);

  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 30);
  ctx.fillText(o.footer, W / 2, H - 56);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}
