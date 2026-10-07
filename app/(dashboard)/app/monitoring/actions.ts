"use server";

import { revalidatePath } from "next/cache";
import { getRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/validation/form-state";
import { disableMonitoring, enableMonitoring } from "@/server/services/monitoring/monitoring-service";

function refresh() {
  revalidatePath("/app/monitoring");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/identities", "layout");
}

export async function setMonitoringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const identityId = String(formData.get("identityId") ?? "");
  const { requestId } = await getRequestContext();
  const result =
    formData.get("enabled") === "true"
      ? await enableMonitoring(session.user.id, identityId, formData.get("frequency"), { requestId })
      : await disableMonitoring(session.user.id, identityId, { requestId });
  if (!result.ok) {
    const message =
      result.reason === "invalid_frequency"
        ? "Choose how often to check."
        : result.reason === "not_verified"
          ? "Verify this address before turning on monitoring."
          : "That identity wasn't found.";
    return { status: "error", message };
  }
  refresh();
  return { status: "success", message: result.nextScanAt ? "Monitoring is on." : "Monitoring is off." };
}
