/**
 * إعداد «رسائل SMS من هاتف العيادة» — لصاحب العيادة فقط.
 * GET: الحالة (بلا كلمة السرّ أبداً). POST {action}: save | test | remove.
 */
import { DomainError } from "@/lib/domain/types";
import { handle, readJson, requireOwner } from "@/lib/server/http";
import { removeSmsGateway, saveSmsSettings, sendTest, smsSettingsView } from "@/lib/server/smsgate";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => smsSettingsView(await requireOwner(slug)));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    const body = await readJson(req);
    switch (body.action) {
      case "save":
        return saveSmsSettings(shop, body);
      case "test":
        return sendTest(shop, body.to, body.lang);
      case "remove":
        return removeSmsGateway(shop);
      default:
        throw new DomainError("invalid_action");
    }
  });
}
