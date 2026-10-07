import { Types } from "mongoose";

/**
 * Strict ObjectId parsing: exactly 24 lowercase hex characters that round-trip.
 * (`Types.ObjectId.isValid` also accepts any 12-character string.)
 */
export function parseObjectId(id: unknown): Types.ObjectId | null {
  if (typeof id !== "string" || !/^[0-9a-f]{24}$/.test(id)) return null;
  const parsed = new Types.ObjectId(id);
  return parsed.toHexString() === id ? parsed : null;
}
