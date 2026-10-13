import { handle, readJson } from "@/lib/server/http";
import { reviewState, submitReview } from "@/lib/server/reviews";

/** معرّف التذكرة هو صلاحية المريض: لا يكشف إلّا تقييم هذه التذكرة. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => reviewState(id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => submitReview(id, await readJson(req)));
}
