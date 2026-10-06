import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdentityCard } from "@/components/identity/identity-card";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { ScanProgress } from "@/components/monitoring/scan-progress";
import { AccessState, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { expectNoAxeViolations } from "./axe";

describe("MonitoringStatus", () => {
  it("shows the honest M1 state: off, manual scans only, nothing scheduled", () => {
    render(<MonitoringStatus state="off" lastScanAt={null} nextScanAt="2026-10-07T00:00:00.000Z" />);
    expect(screen.getByText(/off/i, { selector: "span" })).toHaveTextContent(/Off\s*— Manual scans only/);
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
  });
});

describe("ScanProgress", () => {
  const providers = [
    { name: "Source A", state: "ok" as const },
    { name: "Source B", state: "ok" as const },
    { name: "Source C", state: "error" as const },
  ];

  it("announces state through a single polite live region", () => {
    render(<ScanProgress state="running" providers={[{ name: "Source A", state: "pending" }]} />);
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAttribute("aria-live", "polite");
    expect(regions[0]).toHaveTextContent("Checking sources…");
  });

  it("marks the current step for assistive tech", () => {
    render(<ScanProgress state="matching" providers={providers} />);
    expect(screen.getByText("Matching to your identity").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("says plainly when results may be incomplete and offers the retry", () => {
    render(
      <ScanProgress
        state="partial"
        providers={providers}
        retry={<button type="button">Retry failed source</button>}
      />,
    );
    expect(screen.getByText("2 of 3 sources responded. Results may be incomplete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry failed source" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<ScanProgress state="partial" providers={providers} />);
    await expectNoAxeViolations(container);
  });
});

describe("IdentityCard", () => {
  it("tells the user exactly what to do while verification is pending", () => {
    render(
      <IdentityCard
        identity={{
          id: "1",
          type: "email",
          masked: "a****x@example.com",
          verification: "pending",
          monitoring: "off",
          lastScanAt: null,
          activeExposures: 0,
        }}
        action={<button type="button">Resend verification email</button>}
      />,
    );
    expect(screen.getByText(/awaiting verification/i)).toBeInTheDocument();
    expect(screen.getByText(/open it to prove you control it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend/i })).toBeInTheDocument();
  });
});

describe("state components", () => {
  it("LoadingState announces what is loading and hides the skeleton", () => {
    const { container } = render(<LoadingState label="Loading exposures" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading exposures…");
    for (const skeleton of container.querySelectorAll("[aria-hidden='true']")) {
      expect(skeleton).not.toHaveTextContent(/./);
    }
  });

  it("ErrorState interrupts only when asked to", () => {
    const { rerender } = render(<ErrorState title="Failed" />);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<ErrorState title="Failed" announce />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
  });

  it("forbidden state does not confirm the resource exists", () => {
    render(<AccessState kind="forbidden" />);
    expect(screen.getByText(/may not exist/i)).toBeInTheDocument();
  });

  it("all states pass axe", async () => {
    const { container } = render(
      <div>
        <EmptyState title="No known exposures detected" description="Not found in the 3 sources checked." />
        <ErrorState title="Couldn't load" />
        <LoadingState label="Loading" />
        <AccessState kind="unauthorized" />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
