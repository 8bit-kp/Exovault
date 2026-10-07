/**
 * IANA timezones for pickers. ICU still lists some zones under legacy names
 * (e.g. "Asia/Calcutta"); people look for the modern ones, so those are
 * swapped in. Both forms are accepted by Intl and by our validation.
 */
const MODERN_NAMES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
};

export function listTimeZones(include?: string): string[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone").map((z) => MODERN_NAMES[z] ?? z));
  zones.add("UTC");
  if (include) zones.add(include);
  return [...zones].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
}
