import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Components under test render outside the Next.js router.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/exposures/ex-1",
}));
