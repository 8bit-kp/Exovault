import type { ExposedDataType, ExposureSourceType } from "@/lib/domain/exposure";

/** Plain-language labels; users should not need security vocabulary (spec 13.1). */
export const DATA_TYPE_LABELS: Record<ExposedDataType, string> = {
  email: "Email address",
  name: "Name",
  username: "Username",
  password_plaintext: "Password (readable)",
  password_hash: "Password (scrambled)",
  auth_token: "Login session token",
  security_qa: "Security questions",
  financial: "Financial details",
  government_id: "Government ID",
  physical_address: "Home address",
  phone: "Phone number",
  date_of_birth: "Date of birth",
  ip_address: "IP address",
  mfa_backup_codes: "2FA backup codes",
  profile: "Profile details",
  other: "Other data",
};

export const SOURCE_TYPE_LABELS: Record<ExposureSourceType, string> = {
  breach: "Data breach",
  combo_list: "Credential list",
  stealer_log: "Malware (infostealer) log",
  paste: "Public paste",
  other: "Other source",
};
