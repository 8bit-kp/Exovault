import type { DetectionState, RemediationState } from "@/lib/domain/exposure";

export const REMEDIATION_LABELS: Record<RemediationState, string> = {
  open: "Open",
  in_progress: "In progress",
  remediated: "Remediated",
  dismissed: "Dismissed",
};

export const DETECTION_LABELS: Record<DetectionState, string> = {
  new: "New",
  existing: "Seen before",
  changed: "Changed",
  no_longer_reported: "No longer reported",
};

/** Sensitive sources are never named outside the detail view (spec 2.3). */
export const SENSITIVE_SOURCE_PLACEHOLDER = "Sensitive source (hidden)";
