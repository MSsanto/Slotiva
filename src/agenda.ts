import type { Booking } from "./api";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function brasiliaDate(now = new Date()) {
  const parts = dateFormatter.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export type AgendaTab = "today" | "future" | "cancelled" | "history";

export function groupAgenda(bookings: Booking[], today: string) {
  const groups: Record<AgendaTab, Booking[]> = {
    today: [],
    future: [],
    cancelled: [],
    history: [],
  };
  for (const booking of bookings) {
    const tab: AgendaTab =
      booking.status === "cancelled"
        ? "cancelled"
        : booking.date === today
          ? "today"
          : booking.date > today
            ? "future"
            : "history";
    groups[tab].push(booking);
  }
  const compare = (a: Booking, b: Booking) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
  groups.today.sort(compare);
  groups.future.sort(compare);
  groups.cancelled.sort((a, b) => compare(b, a));
  groups.history.sort((a, b) => compare(b, a));
  return groups;
}
