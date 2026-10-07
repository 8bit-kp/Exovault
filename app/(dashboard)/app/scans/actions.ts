"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/validation/form-state";
import {
  retryFailedSources,
  startManualScan,
  type StartScanResult,
} from "@/server/services/scan/scan-service";

const flowSchema = z.enum(["onboarding", "app"]).catch("app");

function destination(flow: "onboarding" | "app", scanId: string): string {
  return flow === "onboarding" ? `/onboarding/scan?scan=${scanId}` : `/app/scans/${scanId}`;
}

function failure(result: Exclude<StartScanResult, { ok: true }>): FormState {
  switch (result.reason) {
    case "cooldown": {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      return {
        status: "error",
        message: `You can scan this address again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
    case "rate_limited":
      return { status: "error", message: "You've retried this scan several times. Try again later." };
    case "not_verified":
      return { status: "error", message: "Verify this address before scanning it." };
    case "not_retryable":
      return { status: "error", message: "There's nothing to retry for this scan." };
    case "unavailable":
      return { status: "error", message: "Scanning is temporarily unavailable. Please try again shortly." };
    default:
      return { status: "error", message: "That identity wasn't found." };
  }
}

export async function startScanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const flow = flowSchema.parse(formData.get("flow"));
  const { requestId } = await getRequestContext();
  const result = await startManualScan(session.user.id, String(formData.get("identityId") ?? ""), {
    requestId,
  });
  if (!result.ok) return failure(result);
  revalidatePath("/app", "layout");
  redirect(destination(flow, result.scanId));
}

export async function retryScanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const flow = flowSchema.parse(formData.get("flow"));
  const { requestId } = await getRequestContext();
  const result = await retryFailedSources(session.user.id, String(formData.get("scanId") ?? ""), {
    requestId,
  });
  if (!result.ok) return failure(result);
  revalidatePath("/app", "layout");
  redirect(destination(flow, result.scanId));
}
