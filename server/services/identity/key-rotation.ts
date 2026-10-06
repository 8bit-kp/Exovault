import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/mongoose";
import { keyringFromEnv, rotateField, type Keyring } from "@/lib/crypto/field-encryption";
import { logger } from "@/lib/logging/logger";
import { Identity } from "@/models/Identity";

export interface RotationReport {
  scanned: number;
  rotated: number;
  skipped: number;
  failed: number;
}

/**
 * Re-encrypts every identity still under a non-active key (spec 5.1). Safe to
 * re-run and to run while the app serves traffic: each row is rewritten with
 * a compare-and-set on its old ciphertext, so a concurrent change wins.
 * Retire an old key from the keyring only after a run reports `failed: 0`
 * and nothing left to rotate.
 */
export async function rotateIdentityKeys(
  keyring: Keyring = keyringFromEnv(),
  batchSize = 200,
): Promise<RotationReport> {
  await connectToDatabase();
  const report: RotationReport = { scanned: 0, rotated: 0, skipped: 0, failed: 0 };
  const cursor = Identity.find({ "valueEncrypted.keyId": mongoose.trusted({ $ne: keyring.activeKeyId }) })
    .select({ valueEncrypted: 1 })
    .lean()
    .cursor({ batchSize });

  for await (const row of cursor) {
    report.scanned += 1;
    try {
      const rotated = rotateField(row.valueEncrypted, `identity:${String(row._id)}`, keyring);
      const result = await Identity.updateOne(
        { _id: row._id, "valueEncrypted.ciphertext": row.valueEncrypted.ciphertext },
        { $set: { valueEncrypted: rotated } },
      );
      if (result.modifiedCount === 1) report.rotated += 1;
      else report.skipped += 1;
    } catch (error) {
      report.failed += 1;
      logger.error(
        { identityId: String(row._id), err: error instanceof Error ? error.name : "unknown" },
        "key rotation failed",
      );
    }
  }
  return report;
}
