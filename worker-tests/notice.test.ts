import { describe, it, expect } from "vitest";
import { requireNotice } from "../worker/booking";
describe("48-hour elapsed notice boundary", () => {
  it("rejects just below 48h and accepts exactly 48h across dates", () => {
    const at = Date.parse("2026-12-31T23:30:00Z") / 1000;
    expect(() => requireNotice(at + 172799, at)).toThrow("48 horas");
    expect(() => requireNotice(at + 172800, at)).not.toThrow();
  });
});
