"use server";

import { unsubscribeWithToken } from "@/server/services/notification/notification-service";

export async function unsubscribeAction(
  _prev: { status: "idle" | "done" | "invalid" },
  formData: FormData,
): Promise<{ status: "idle" | "done" | "invalid" }> {
  const token = formData.get("token");
  return (await unsubscribeWithToken(typeof token === "string" ? token : undefined))
    ? { status: "done" }
    : { status: "invalid" };
}
