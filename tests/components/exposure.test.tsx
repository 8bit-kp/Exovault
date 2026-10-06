import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExposureCard } from "@/components/exposure/exposure-card";
import { ExposureList } from "@/components/exposure/exposure-list";
import { RemediationChecklist } from "@/components/exposure/remediation-checklist";
import { EXAMPLE_EXPOSURES } from "@/lib/demo/examples";
import { expectNoAxeViolations } from "./axe";

const [critical, , sensitive] = EXAMPLE_EXPOSURES;

describe("ExposureCard", () => {
  it("exposes one link, named after the source, to the detail page", () => {
    render(<ExposureCard exposure={critical} href="/app/exposures/ex-1" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(critical.sourceName);
    expect(links[0]).toHaveAttribute("href", "/app/exposures/ex-1");
  });

  it("never names a sensitive source in a list view (spec 2.3)", () => {
    const { container } = render(<ExposureCard exposure={sensitive} href="/app/exposures/ex-3" />);
    expect(container).not.toHaveTextContent(sensitive.sourceName);
    expect(screen.getByRole("link")).toHaveAccessibleName(/sensitive source \(hidden\)/i);
  });

  it("does not render the identifier or anything beyond the masked value", () => {
    const { container } = render(<ExposureCard exposure={critical} href="/x" />);
    expect(container.innerHTML).not.toMatch(/@example\.com/);
  });

  it("shows plain-language data categories", () => {
    render(<ExposureCard exposure={critical} href="/x" />);
    const list = screen.getByRole("list", { name: /exposed data/i });
    expect(within(list).getByText("Password (readable)")).toBeInTheDocument();
    expect(within(list).getByText("+1 more")).toBeInTheDocument();
  });
});

describe("ExposureList", () => {
  it("renders the caller's empty state when there is nothing to show", () => {
    render(
      <ExposureList label="Exposures" exposures={[]} hrefFor={() => "/x"} empty={<p>Nothing found</p>} />,
    );
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ExposureList
        label="Exposures"
        exposures={EXAMPLE_EXPOSURES}
        hrefFor={(e) => `/app/exposures/${e.id}`}
        empty={null}
      />,
    );
    await expectNoAxeViolations(container);
  });
});

describe("RemediationChecklist", () => {
  const items = [
    { id: "a", label: "Change the password", done: false },
    { id: "b", label: "Turn on 2FA", description: "Use an authenticator app.", done: true },
  ];

  it("is operable with the keyboard and reports progress", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn().mockResolvedValue(undefined);
    render(<RemediationChecklist items={items} onToggle={onToggle} />);

    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: "Change the password" });
    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(" ");
    expect(onToggle).toHaveBeenCalledWith("a", true);
  });

  it("links descriptions to their checkbox", () => {
    render(<RemediationChecklist items={items} onToggle={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Turn on 2FA" })).toHaveAccessibleDescription(
      "Use an authenticator app.",
    );
  });

  it("announces a failed save instead of silently dropping it", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn().mockRejectedValue(new Error("network"));
    render(<RemediationChecklist items={items} onToggle={onToggle} />);
    await user.click(screen.getByRole("checkbox", { name: "Change the password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/wasn't saved/);
    expect(screen.getByRole("checkbox", { name: "Change the password" })).not.toBeChecked();
  });

  it("has no axe violations", async () => {
    const { container } = render(<RemediationChecklist items={items} onToggle={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});
