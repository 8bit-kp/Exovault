"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/validation/form-state";
import {
  revealSensitiveSource,
  setChecklistItem,
  setRemediationState,
} from "@/server/services/remediation/remediation-service";

async function ctx() {
  return { requestId: (await getRequestContext()).requestId };
}

function refresh(exposureId: string) {
  revalidatePath(`/app/exposures/${exposureId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/exposures");
}

/** Called directly by the checklist (optimistic UI). Throws a safe error so the tick rolls back. */
export async function setChecklistItemAction(exposureId: string, key: string, done: boolean): Promise<void> {
  const session = await requireSession();
  const parsed = z
    .object({ exposureId: z.string().max(64), key: z.string().max(64), done: z.boolean() })
    .safeParse({ exposureId, key, done });
  if (!parsed.success) throw new Error("invalid");
  const result = await setChecklistItem(
    session.user.id,
    parsed.data.exposureId,
    parsed.data.key,
    parsed.data.done,
    await ctx(),
  );
  if (!result.ok) throw new Error("not saved");
  refresh(parsed.data.exposureId);
}

const stateSchema = z.object({
  exposureId: z.string().max(64),
  to: z.enum(["open", "remediated", "dismissed"]),
  reason: z.string().max(40).optional(),
});

export async function setRemediationStateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = stateSchema.safeParse({
    exposureId: formData.get("exposureId"),
    to: formData.get("to"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "That change isn't possible." };
  const result = await setRemediationState(
    session.user.id,
    parsed.data.exposureId,
    parsed.data.to,
    await ctx(),
    parsed.data.reason ?? null,
  );
  if (!result.ok) {
    const message =
      result.reason === "reason_required"
        ? "Choose why you're dismissing this."
        : result.reason === "not_found"
          ? "That exposure wasn't found."
          : "That change isn't possible from the current status.";
    return { status: "error", message };
  }
  refresh(parsed.data.exposureId);
  return { status: "success", message: "Status updated." };
}

export interface RevealSourceState {
  status: "idle" | "revealed" | "error";
  sourceName?: string;
}

export async function revealSourceAction(
  _prev: RevealSourceState,
  formData: FormData,
): Promise<RevealSourceState> {
  const session = await requireSession();
  const result = await revealSensitiveSource(
    session.user.id,
    String(formData.get("exposureId") ?? ""),
    await ctx(),
  );
  return result.ok ? { status: "revealed", sourceName: result.sourceName } : { status: "error" };
}
