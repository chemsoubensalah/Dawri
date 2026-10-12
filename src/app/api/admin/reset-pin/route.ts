import { DomainError } from "@/lib/domain/types";
import { isAdmin } from "@/lib/server/admin";
import { handle, readJson } from "@/lib/server/http";
import { adminResetPin } from "@/lib/server/service";

/** لوحة المؤسّس: رمز مؤقّت جديد لعيادة نسيت رمزها ولا بريد لها. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await isAdmin())) throw new DomainError("unauthorized", 401);
    return adminResetPin(String((await readJson(req)).shopId));
  });
}
