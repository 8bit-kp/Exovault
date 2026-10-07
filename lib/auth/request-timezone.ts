import "server-only";
import { cache } from "react";
import { setDefaultTimeZoneProvider } from "@/lib/utils/format";

/**
 * Per-request display timezone. React's `cache` gives one store per server
 * request, so concurrent users never see each other's timezone. Set once
 * per request by requireSession() from the user's preferences.
 */
const store = cache(() => ({ timeZone: "UTC" }));

export function setRequestTimeZone(timeZone: string): void {
  store().timeZone = timeZone;
}

setDefaultTimeZoneProvider(() => store().timeZone);
