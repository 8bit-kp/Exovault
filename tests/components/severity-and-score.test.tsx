import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskBadge } from "@/components/dashboard/risk-badge";
import { SecurityScore } from "@/components/dashboard/security-score";
import { SeverityBreakdown } from "@/components/dashboard/severity-breakdown";
import { SeverityBadge } from "@/components/exposure/severity-badge";
import { SEVERITY_META } from "@/components/exposure/severity-meta";
import { EXPOSURE_SEVERITIES } from "@/lib/domain/exposure";
import { RISK_BANDS } from "@/lib/domain/risk";
import { expectNoAxeViolations } from "./axe";

describe("SeverityBadge: never colour alone (spec 13.9)", () => {
  it.each(EXPOSURE_SEVERITIES)("%s carries a text label, an icon and a pip pattern", (severity) => {
    const { container } = render(<SeverityBadge severity={severity} />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge).toHaveTextContent(new RegExp(`^${SEVERITY_META[severity].label} severity$`));
    expect(badge.querySelector("svg")).not.toBeNull();
    const pips = badge.querySelector("[data-pips]");
    expect(pips).toHaveAttribute("aria-hidden", "true");
    expect(pips).toHaveAttribute("data-pips", String(SEVERITY_META[severity].pips));
  });

  it("gives every severity a distinct label, icon and pip count", () => {
    const metas = EXPOSURE_SEVERITIES.map((s) => SEVERITY_META[s]);
    expect(new Set(metas.map((m) => m.label)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => m.icon)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => m.pips)).size).toBe(metas.length);
  });
});

describe("RiskBadge", () => {
  it.each(RISK_BANDS)("labels the %s band in words", (band) => {
    render(<RiskBadge band={band} />);
    expect(screen.getByText(new RegExp(band, "i"))).toBeInTheDocument();
  });
});

describe("SecurityScore", () => {
  it("always states the direction and that the score is ours, not a standard", () => {
    render(<SecurityScore score={62} />);
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText(/higher means more risk/i)).toBeInTheDocument();
    expect(screen.getByText(/not an industry-standard security score/i)).toBeInTheDocument();
    expect(screen.getByText(/high/i, { selector: "[data-band]" })).toBeInTheDocument();
  });

  it("reports an increase as more risk and a decrease as less risk", () => {
    const { rerender } = render(<SecurityScore score={62} previousScore={50} />);
    expect(screen.getByText(/up 12 since last scan/i)).toHaveTextContent(/more risk/);
    rerender(<SecurityScore score={40} previousScore={62} />);
    expect(screen.getByText(/down 22 since last scan/i)).toHaveTextContent(/less risk/);
  });

  it("shows an honest empty reading before the first scan instead of a zero", () => {
    render(<SecurityScore score={null} />);
    expect(screen.queryByText("0", { selector: "data" })).toBeNull();
    expect(screen.getByText(/not yet scored/i)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<SecurityScore score={62} previousScore={71} />);
    await expectNoAxeViolations(container);
  });
});

describe("SeverityBreakdown", () => {
  it("lists every severity, including zeros, and totals the counts", () => {
    render(<SeverityBreakdown counts={{ critical: 1, high: 2 }} />);
    expect(screen.getByText(/active exposures/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    const terms = screen.getAllByRole("term");
    expect(terms.map((t) => t.textContent)).toEqual(["Critical", "High", "Medium", "Low", "Info"]);
    const low = terms[3].parentElement as HTMLElement;
    expect(within(low).getByText("0")).toBeInTheDocument();
  });
});
