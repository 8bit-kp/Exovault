import type { ExposedDataType } from "@/lib/domain/exposure";

/**
 * HIBP data class → our vocabulary. HIBP-specific strings stay in this folder
 * (spec 7.2). Unlisted classes map to "profile" when they describe a person and
 * "other" otherwise; the contract test fails if a mapping goes stale.
 *
 * "Passwords" is ambiguous in HIBP (hashed or plaintext). It maps to
 * `password_hash` (High) rather than `password_plaintext` (Critical) (D-027).
 */
const MAP: Record<string, ExposedDataType> = {
  "Email addresses": "email",
  Names: "name",
  Salutations: "name",
  Usernames: "username",
  Passwords: "password_hash",
  "Historical passwords": "password_hash",
  "Auth tokens": "auth_token",
  "Security questions and answers": "security_qa",
  "Credit cards": "financial",
  "Partial credit card data": "financial",
  "Credit card CVV": "financial",
  "Bank account numbers": "financial",
  "Account balances": "financial",
  "Payment histories": "financial",
  "Credit status information": "financial",
  "Government issued IDs": "government_id",
  "Passport numbers": "government_id",
  "Social security numbers": "government_id",
  "National identity numbers": "government_id",
  "Driver's licenses": "government_id",
  "Tax file numbers": "government_id",
  "Physical addresses": "physical_address",
  "Phone numbers": "phone",
  "Dates of birth": "date_of_birth",
  "Partial dates of birth": "date_of_birth",
  "IP addresses": "ip_address",
};

const PROFILE_HINTS =
  /gender|location|job|employer|social media|photo|avatar|bio|language|education|income|marital|relationship|religion|ethnic|nationalit|sexual|age|occupation|physical attribute|family|health|habit|vehicle|time zone|spoken|profile/i;

export function mapHibpDataClass(dataClass: string): ExposedDataType {
  return MAP[dataClass] ?? (PROFILE_HINTS.test(dataClass) ? "profile" : "other");
}

export function mapHibpDataClasses(dataClasses: readonly string[]): ExposedDataType[] {
  return [...new Set(dataClasses.map(mapHibpDataClass))].sort();
}
