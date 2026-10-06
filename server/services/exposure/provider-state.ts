import { connectToDatabase } from "@/lib/db/mongoose";
import type { ProviderErrorCategory } from "@/server/providers/exposure/interface";
import { ProviderState } from "@/models/ProviderState";

/**
 * Circuit breaker (spec 7.2) backed by `providerStates`, so every web process
 * and worker share it. After FAILURE_THRESHOLD consecutive failures the circuit
 * opens for COOLDOWN_MS; the first call after the cooldown is the trial
 * ("half-open"): success closes it, failure re-opens it.
 */
export const FAILURE_THRESHOLD = 3;
export const COOLDOWN_MS = 5 * 60_000;

/** Errors that say nothing about provider health: don't count them toward the breaker. */
const NOT_HEALTH_RELATED: ProviderErrorCategory[] = ["invalid_response"];

export async function isCircuitOpen(provider: string, now = new Date()): Promise<boolean> {
  await connectToDatabase();
  const state = await ProviderState.findOne({ provider }, { cooldownUntil: 1 }).lean();
  return Boolean(state?.cooldownUntil && state.cooldownUntil > now);
}

export async function recordProviderSuccess(provider: string, now = new Date()): Promise<void> {
  await connectToDatabase();
  await ProviderState.updateOne(
    { provider },
    { $set: { health: "healthy", consecutiveFailures: 0, lastSuccessAt: now, cooldownUntil: null } },
    { upsert: true },
  );
}

export async function recordProviderFailure(
  provider: string,
  category: ProviderErrorCategory,
  now = new Date(),
): Promise<void> {
  if (NOT_HEALTH_RELATED.includes(category)) return;
  await connectToDatabase();
  // Atomic increment, then open the circuit if this failure crossed the threshold.
  const state = await ProviderState.findOneAndUpdate(
    { provider },
    {
      $inc: { consecutiveFailures: 1 },
      $set: { lastFailureAt: now, lastErrorCategory: category, health: "degraded" },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (state && state.consecutiveFailures >= FAILURE_THRESHOLD) {
    await ProviderState.updateOne(
      { provider },
      { $set: { health: "down", cooldownUntil: new Date(now.getTime() + COOLDOWN_MS) } },
    );
  }
}

export async function getProviderStates() {
  await connectToDatabase();
  return ProviderState.find({}, { _id: 0, __v: 0 }).lean();
}
