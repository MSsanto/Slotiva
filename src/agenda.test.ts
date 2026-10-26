import { describe, expect, it } from "vitest";
import { brasiliaDate, groupAgenda } from "./agenda";
import type { Booking } from "./api";

const booking = (
  id: string,
  date: string,
  status: Booking["status"] = "confirmed",
  time = "09:00",
): Booking => ({
  id,
  date,
  status,
  time,
  serviceId: "fixture",
  serviceName: "Fixture",
  serviceDescription: "",
  serviceDuration: 30,
  servicePriceMode: "free",
  servicePrice: 0,
  serviceVersion: 1,
  name: id,
  email: "",
  approvalExpiresAt: null,
  version: 1,
});

describe("agenda date views", () => {
  it("uses the Brasília calendar day across UTC midnight and year boundaries", () => {
    expect(brasiliaDate(new Date("2026-10-27T02:59:59Z"))).toBe("2026-10-26");
    expect(brasiliaDate(new Date("2026-10-27T03:00:00Z"))).toBe("2026-10-27");
    expect(brasiliaDate(new Date("2027-01-01T01:00:00Z"))).toBe("2026-12-31");
  });
  it("keeps cancelled and earlier records visible, orders each view and leaves input unchanged", () => {
    const rows = [
      booking("future-later", "2026-10-28"),
      booking("today-later", "2026-10-26", "pending_approval", "17:00"),
      booking("old", "2026-10-24"),
      booking("cancelled-old", "2026-10-23", "cancelled"),
      booking("today-early", "2026-10-26", "confirmed", "09:00"),
      booking("future-soon", "2026-10-27"),
      booking("recent", "2026-10-25", "rejected"),
      booking("cancelled-new", "2026-10-30", "cancelled"),
    ];
    const original = rows.map((b) => b.id);
    const groups = groupAgenda(rows, "2026-10-26");
    expect(groups.today.map((b) => b.id)).toEqual([
      "today-early",
      "today-later",
    ]);
    expect(groups.future.map((b) => b.id)).toEqual([
      "future-soon",
      "future-later",
    ]);
    expect(groups.history.map((b) => b.id)).toEqual(["recent", "old"]);
    expect(groups.cancelled.map((b) => b.id)).toEqual([
      "cancelled-new",
      "cancelled-old",
    ]);
    expect(rows.map((b) => b.id)).toEqual(original);
  });
});
