"use server";

import { getRequestContext } from "@/lib/auth/request-context";
import { unsubscribeWithToken } from "@/server/services/notification/notification-service";

export async function unsubscribeAction(
  _prev: { status: "idle" | "done" | "invalid" },
  formData: FormData,
): Promise<{ status: "idle" | "done" | "invalid" }> {
  const token = formData.get("token");
  const { ip } = await getRequestContext();
  return (await unsubscribeWithToken(typeof token === "string" ? token : undefined, ip))
    ? { status: "done" }
    : { status: "invalid" };
}
