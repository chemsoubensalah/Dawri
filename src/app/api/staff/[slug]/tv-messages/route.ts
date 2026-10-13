import { handle, readJson, requireOwner } from "@/lib/server/http";
import { getTvMessages, saveTvMessages } from "@/lib/server/tvmessages";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => ({ items: await getTvMessages((await requireOwner(slug)).id) }));
}

/** {items: string[]} — يستبدل القائمة كلّها (صاحب العيادة فقط). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    return { items: await saveTvMessages(shop, (await readJson(req)).items) };
  });
}
