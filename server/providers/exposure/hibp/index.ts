import { z } from "zod";
import type {
  ExposureProvider,
  ProviderContext,
  ProviderErrorCategory,
  ProviderExposure,
  ProviderSearchResult,
  SearchIdentifier,
} from "../interface";
import { mapHibpDataClasses } from "./data-classes";

/**
 * Have I Been Pwned v3 adapter (docs/PROVIDERS.md). Terms checked 2026-10-06:
 * key required for account search, descriptive User-Agent required, CC BY 4.0
 * with visible attribution, rate limit per subscription (Core 1 = 10 RPM).
 *
 * SSRF: the base URL is a constant; the only variable part is the
 * percent-encoded, already-normalized email in the path.
 */
export const HIBP_BASE_URL = "https://haveibeenpwned.com/api/v3";
export const HIBP_NAME = "hibp";

const breachSchema = z.object({
  Name: z.string().min(1),
  Title: z.string().min(1),
  Domain: z.string().nullable().optional(),
  BreachDate: z.string().nullable().optional(),
  AddedDate: z.string().nullable().optional(),
  DataClasses: z.array(z.string()),
  IsVerified: z.boolean(),
  IsFabricated: z.boolean().optional().default(false),
  IsSensitive: z.boolean(),
  IsRetired: z.boolean().optional().default(false),
  IsSpamList: z.boolean().optional().default(false),
  IsMalware: z.boolean().optional().default(false),
  IsStealerLog: z.boolean().optional().default(false),
});
const responseSchema = z.array(breachSchema).max(5_000);
type HibpBreach = z.infer<typeof breachSchema>;

export interface HibpOptions {
  apiKey: string;
  userAgent: string;
  /** Matches the purchased subscription (Core 1 = 10 RPM). */
  requestsPerMinute?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Confidence (docs/EXPOSURE-ENGINE.md): verified 0.95, unverified 0.6, spam list 0.5. */
function confidenceOf(breach: HibpBreach): number {
  if (breach.IsSpamList) return 0.5;
  return breach.IsVerified ? 0.95 : 0.6;
}

export function mapHibpBreach(breach: HibpBreach): ProviderExposure {
  return {
    providerReference: breach.Name,
    sourceName: breach.Title,
    sourceType:
      breach.IsStealerLog || breach.IsMalware ? "stealer_log" : breach.IsSpamList ? "other" : "breach",
    breachDate: parseDate(breach.BreachDate),
    addedToProviderAt: parseDate(breach.AddedDate),
    exposedDataTypes: mapHibpDataClasses(breach.DataClasses),
    isSensitiveSource: breach.IsSensitive,
    confidence: confidenceOf(breach),
    // Public breach page: a reference, never raw data.
    evidenceReference: `https://haveibeenpwned.com/Breach/${encodeURIComponent(breach.Name)}`,
  };
}

function error(
  category: ProviderErrorCategory,
  retryable: boolean,
  retryAfterMs?: number,
): ProviderSearchResult {
  return { status: "error", category, retryable, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
}

export function createHibpProvider(options: HibpOptions): ExposureProvider {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  return {
    getName: () => HIBP_NAME,
    getCapabilities: () => ({
      identifierTypes: ["email"],
      rateLimit: { requests: options.requestsPerMinute ?? 10, windowMs: 60_000 },
      attribution: { name: "Have I Been Pwned", url: "https://haveibeenpwned.com" },
    }),
    async search(identifier: SearchIdentifier, ctx?: ProviderContext): Promise<ProviderSearchResult> {
      if (identifier.type !== "email") return error("invalid_response", false);
      const url = `${HIBP_BASE_URL}/breachedAccount/${encodeURIComponent(identifier.normalizedValue)}?truncateResponse=false`;
      const signal = ctx?.signal
        ? AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

      let response: Response;
      try {
        response = await doFetch(url, {
          method: "GET",
          headers: {
            "hibp-api-key": options.apiKey,
            "user-agent": options.userAgent,
            accept: "application/json",
          },
          redirect: "error",
          signal,
        });
      } catch (cause) {
        const name = (cause as { name?: string }).name;
        return name === "TimeoutError" || name === "AbortError"
          ? error("timeout", true)
          : error("unavailable", true);
      }

      switch (response.status) {
        case 200:
          break;
        case 404: // "not pwned": a successful check with no findings
          return { status: "ok", exposures: [], checkedAt: new Date() };
        case 401:
        case 403:
          return error("unauthorized", false);
        case 429: {
          const seconds = Number(response.headers.get("retry-after"));
          return error(
            "rate_limited",
            true,
            Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
          );
        }
        case 400:
          return error("invalid_response", false);
        default:
          return error("unavailable", response.status >= 500);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return error("invalid_response", true);
      }
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) return error("invalid_response", false);

      // Retired breaches shouldn't appear; fabricated ones describe data that isn't real (D-027).
      const exposures = parsed.data.filter((b) => !b.IsRetired && !b.IsFabricated).map(mapHibpBreach);
      return { status: "ok", exposures, checkedAt: new Date() };
    },
  };
}
