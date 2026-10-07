import { isActiveExposure, type ExposedDataType, type ExposureSeverity } from "@/lib/domain/exposure";
import { SEVERITY_RANK } from "@/lib/domain/severity";
import type { ExposureView } from "@/components/exposure/types";

/**
 * "What should I do now?" (spec 13.1, 13.5). Pure: account state + exposures
 * in, at most MAX actions out, most urgent first, one per concern. Sensitive
 * sources are never named (spec 2.3).
 */
export interface RecommendedAction {
  key: string;
  title: string;
  reason: string;
  priority: ExposureSeverity;
  action: { label: string; href: string };
}

export interface RecommendationInput {
  hasIdentity: boolean;
  hasVerifiedIdentity: boolean;
  hasScanned: boolean;
  exposures: readonly ExposureView[];
}

export const MAX_RECOMMENDATIONS = 5;
const PASSWORD_TYPES: readonly ExposedDataType[] = ["password_plaintext", "password_hash"];

const sourceLabel = (e: ExposureView) => (e.sensitive ? "a sensitive source" : e.sourceName);
const has = (e: ExposureView, ...types: ExposedDataType[]) => e.dataTypes.some((t) => types.includes(t));

export function getRecommendedActions(input: RecommendationInput): RecommendedAction[] {
  if (!input.hasIdentity) {
    return [
      {
        key: "add-identity",
        title: "Add the email address you want checked",
        reason: "Nothing can be checked until you add and verify an address you own.",
        priority: "info",
        action: { label: "Add address", href: "/onboarding/identity" },
      },
    ];
  }
  if (!input.hasVerifiedIdentity) {
    return [
      {
        key: "verify-identity",
        title: "Finish verifying your address",
        reason: "We only check addresses you've proven you control.",
        priority: "info",
        action: { label: "Verify", href: "/app/identities" },
      },
    ];
  }
  if (!input.hasScanned) {
    return [
      {
        key: "first-scan",
        title: "Run your first scan",
        reason: "See which known breaches include your verified address.",
        priority: "info",
        action: { label: "Scan now", href: "/app/dashboard" },
      },
    ];
  }

  const open = input.exposures.filter((e) => isActiveExposure(e) && e.remediationState === "open");
  const actions: RecommendedAction[] = [];
  const add = (a: RecommendedAction) => {
    if (!actions.some((x) => x.key === a.key)) actions.push(a);
  };
  const exposuresLink = { label: "Review", href: "/app/exposures" };

  // One "change this password" per exposed account, most severe first.
  const passwordExposures = [...open]
    .filter((e) => has(e, ...PASSWORD_TYPES) || e.sourceType === "stealer_log")
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  for (const e of passwordExposures.slice(0, 2)) {
    add({
      key: `change-password:${e.id}`,
      title:
        e.sourceType === "stealer_log"
          ? "Change passwords saved on an infected device"
          : `Change your ${sourceLabel(e)} password`,
      reason:
        e.sourceType === "stealer_log"
          ? "Malware logs include passwords saved in a browser. Change them from a clean device and scan that device."
          : has(e, "password_plaintext")
            ? "Your password was exposed in readable form. Anyone with the data can try it."
            : "A scrambled copy of your password was exposed. Weak passwords can be cracked from it.",
      priority: e.severity,
      action: exposuresLink,
    });
  }
  if (passwordExposures.length > 0) {
    add({
      key: "reused-passwords",
      title: "Change the same password anywhere you reused it",
      reason: "Attackers try leaked passwords on other sites. A password manager makes every one unique.",
      priority: "high",
      action: exposuresLink,
    });
    add({
      key: "enable-mfa",
      title: "Turn on two-factor authentication for important accounts",
      reason:
        "It stops sign-ins that only have your password. Start with email, banking and social accounts.",
      priority: "high",
      action: exposuresLink,
    });
  }
  if (open.some((e) => has(e, "security_qa"))) {
    add({
      key: "security-questions",
      title: "Change your security questions and answers",
      reason: "Exposed answers can be used to reset your password. Treat them like passwords.",
      priority: "critical",
      action: exposuresLink,
    });
  }
  if (open.some((e) => has(e, "financial"))) {
    add({
      key: "watch-statements",
      title: "Check bank and card statements",
      reason: "Financial details were exposed. Report anything unfamiliar to your bank.",
      priority: "critical",
      action: exposuresLink,
    });
  }
  if (open.some((e) => has(e, "government_id"))) {
    add({
      key: "identity-fraud",
      title: "Watch for identity fraud",
      reason: "A government ID was exposed. Consider a credit freeze or fraud alert where available.",
      priority: "high",
      action: exposuresLink,
    });
  }
  if (open.some((e) => has(e, "phone"))) {
    add({
      key: "phone",
      title: "Be wary of texts and calls asking for codes",
      reason: "Your phone number was exposed. Ask your carrier about a port-out PIN to block SIM swaps.",
      priority: "medium",
      action: exposuresLink,
    });
  }

  return actions
    .map((a, index) => ({ a, index }))
    .sort((x, y) => SEVERITY_RANK[y.a.priority] - SEVERITY_RANK[x.a.priority] || x.index - y.index)
    .map(({ a }) => a)
    .slice(0, MAX_RECOMMENDATIONS);
}
