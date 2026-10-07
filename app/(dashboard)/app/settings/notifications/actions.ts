"use server";

import { revalidatePath } from "next/cache";
import { getRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/validation/form-state";
import { markAllRead, updatePreferences } from "@/server/services/notification/notification-service";

export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const { requestId } = await getRequestContext();
  const result = await updatePreferences(
    session.user.id,
    {
      emailEnabled: formData.get("emailEnabled") === "on",
      minSeverity: formData.get("minSeverity"),
      mode: formData.get("mode"),
      quietHours: {
        enabled: formData.get("quietEnabled") === "on",
        start: formData.get("quietStart"),
        end: formData.get("quietEnd"),
      },
      timezone: formData.get("timezone"),
    },
    { requestId },
  );
  if (!result.ok)
    return { status: "error", message: "Some settings need attention.", fieldErrors: result.errors };
  revalidatePath("/app/settings/notifications");
  return { status: "success", message: "Notification settings saved." };
}

export async function markAllReadAction(): Promise<void> {
  const session = await requireSession();
  await markAllRead(session.user.id);
  revalidatePath("/app/notifications");
}
