import "server-only";
import { brand } from "@/config/brand";
import { getEnv } from "@/config/env";
import { createHibpProvider } from "./hibp";
import type { ExposureProvider } from "./interface";
import { createDemoProviders } from "./mock";

/**
 * The providers a scan uses. Adding a provider = add a folder + one line here;
 * the engine doesn't change (spec 7.2).
 *  - mock: deterministic demo providers, no keys, results labelled "Demo data".
 *  - live: HIBP (needs HIBP_API_KEY; config/env enforces it).
 */
let override: ExposureProvider[] | undefined;

export function getExposureProviders(): ExposureProvider[] {
  if (override) return override;
  const env = getEnv();
  if (env.PROVIDER_MODE === "mock") return createDemoProviders();
  return [
    createHibpProvider({
      apiKey: env.HIBP_API_KEY!,
      // HIBP requires a User-Agent that describes the consumer accurately.
      userAgent: `${brand.name}/0.1 (+${env.APP_URL})`,
      requestsPerMinute: env.HIBP_REQUESTS_PER_MINUTE,
    }),
  ];
}

/** Test seam. */
export function setExposureProviders(next: ExposureProvider[] | undefined): void {
  override = next;
}
