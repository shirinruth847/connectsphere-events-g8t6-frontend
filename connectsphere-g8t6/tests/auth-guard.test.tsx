import { describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

vi.mock("next/navigation", () => ({
  redirect: (path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

describe("home route", () => {
  it("redirects visitors to login", () => {
    expect(() => Home()).toThrow("NEXT_REDIRECT:/login");
  });
});
