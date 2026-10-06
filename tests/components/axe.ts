import axe from "axe-core";
import { expect } from "vitest";

/**
 * Runs axe (WCAG 2.0–2.2 A/AA rules) against a rendered container. jsdom can't
 * compute colour contrast, so that rule is covered by the Playwright suite.
 */
export async function expectNoAxeViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
}
