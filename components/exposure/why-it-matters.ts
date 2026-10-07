import type { ExposedDataType, ExposureSourceType } from "@/lib/domain/exposure";

/** Plain-language consequences (spec 13.1: no security expertise needed). Most serious first. */
const REASONS: Array<[ExposedDataType, string]> = [
  [
    "password_plaintext",
    "Your password was readable. Anyone with this data can try it on this site and others.",
  ],
  ["auth_token", "A login token was exposed. It can let someone into your account without the password."],
  [
    "password_hash",
    "A scrambled copy of your password was exposed. Short or common passwords can be cracked from it.",
  ],
  ["security_qa", "Security answers can be used to reset your password, and they rarely change."],
  ["financial", "Payment or bank details can be used for fraud."],
  ["government_id", "ID numbers can be used to open accounts in your name."],
  ["physical_address", "Your home address can be used for targeted scams or to answer identity checks."],
  ["phone", "Your phone number can be used for scam texts and SIM-swap attempts."],
  ["date_of_birth", "Your date of birth is a common identity-check answer."],
  ["ip_address", "An IP address can reveal your rough location."],
];

export function whyItMatters(
  dataTypes: readonly ExposedDataType[],
  sourceType: ExposureSourceType,
): string[] {
  const reasons: string[] = [];
  if (sourceType === "stealer_log") {
    reasons.push(
      "This came from malware on a device. It may have captured every password saved in that browser.",
    );
  }
  for (const [type, text] of REASONS) if (dataTypes.includes(type)) reasons.push(text);
  if (reasons.length === 0) {
    reasons.push(
      "Your email address is known to be on a leaked list, which makes you a target for spam and phishing.",
    );
  }
  return reasons;
}
