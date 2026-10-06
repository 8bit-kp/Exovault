import { createHash } from "node:crypto";

/**
 * Stable exposure ID within an identity (spec 7.5, D-026):
 * identity + normalized source key + incident day.
 *
 * Exposed data categories are deliberately NOT part of it: when a provider
 * adds categories to a known breach, that's the same exposure in state
 * CHANGED (spec 7.7), not a new one. Provider references aren't part of it
 * either, so the same breach from two providers merges.
 */
export function createExposureFingerprint(input: {
  identityId: string;
  sourceKey: string;
  breachDate: Date | null;
}): string {
  const day = input.breachDate ? input.breachDate.toISOString().slice(0, 10) : "unknown";
  return createHash("sha256")
    .update(JSON.stringify(["exposure-fp-v1", input.identityId, input.sourceKey, day]))
    .digest("hex");
}
