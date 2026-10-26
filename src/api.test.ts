import { describe, it, expect } from "vitest";
import { nextDays, whatsappContactUrl } from "./api";
describe("professional calendar", () => {
  it("crosses month and year boundaries using UTC keys", () => {
    const days = nextDays("2026-12-30", 3);
    expect(days.map((d) => d.key)).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(days.map((d) => d.day)).toEqual([31, 1, 2]);
  });
});

describe("WhatsApp contact URL", () => {
  it("uses the fixed destination and neutral message, rejecting malformed destinations", () => {
    const href = whatsappContactUrl("5512999990000")!;
    const url = new URL(href);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/5512999990000");
    expect(url.searchParams.get("text")).toBe(
      "Olá! Vim pelo Slotiva e gostaria de falar sobre um atendimento.",
    );
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    for (const number of [
      null,
      undefined,
      "",
      "javascript:alert(1)",
      "5512999990000?text=private",
      "https://evil.example",
      "00000000",
    ]) {
      expect(whatsappContactUrl(number)).toBeNull();
    }
  });
});
