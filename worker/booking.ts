import { z } from "zod";
import { HttpError, now, type BookingRow } from "./types";
export const services = [
  {
    id: "discovery",
    name: "Conversa inicial",
    description: "Um primeiro encontro para entender seus objetivos.",
    duration: 30,
    price: 0,
  },
  {
    id: "consulting",
    name: "Consultoria individual",
    description: "Tempo dedicado para transformar ideias em próximos passos.",
    duration: 60,
    price: 150,
  },
  {
    id: "review",
    name: "Sessão de acompanhamento",
    description: "Revise o progresso e ajuste a direção.",
    duration: 45,
    price: 100,
  },
];
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const toMinutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) &&
      new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v,
  );
export const moveSchema = z
  .object({ date: dateSchema, time: timeSchema })
  .strict();
export const bookingSchema = moveSchema
  .extend({
    serviceId: z.enum(["discovery", "consulting", "review"]),
    name: z.string().trim().min(1).max(100),
    email: z.email().max(200),
  })
  .strict();
export const availabilitySchema = bookingSchema.pick({
  date: true,
  serviceId: true,
});
export const hoursSchema = z
  .object({
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    opens: timeSchema,
    closes: timeSchema,
  })
  .strict()
  .refine(
    (v) =>
      v.opens < v.closes &&
      toMinutes(v.opens) % 30 === 0 &&
      toMinutes(v.closes) % 30 === 0,
  );
export function window(
  date: string,
  time: string,
  serviceId: string,
  professional = false,
) {
  const service = services.find((s) => s.id === serviceId);
  const last = new Date(`${today()}T12:00:00Z`);
  last.setUTCDate(last.getUTCDate() + (professional ? 366 : 14));
  if (
    (professional && Date.parse(`${date}T${time}:00-03:00`) / 1000 <= now()) ||
    !service ||
    (professional ? date < today() : date <= today()) ||
    date > last.toISOString().slice(0, 10) ||
    toMinutes(time) % 30 !== 0
  )
    throw new HttpError(
      422,
      professional
        ? "Escolha um horário futuro nos próximos 366 dias, em intervalos de 30 minutos."
        : "Escolha uma data nos próximos 14 dias e um horário válido.",
    );
  const start = toMinutes(time),
    end = start + service.duration;
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  // São Paulo currently uses UTC-03:00 year-round. Date keys use its IANA zone.
  const startsAt = Date.parse(`${date}T${time}:00-03:00`) / 1000;
  return { start, end, until: end + 15, weekday, startsAt };
}
export function requireNotice(startsAt: number, at = now()) {
  if (startsAt < at + 48 * 3600)
    throw new HttpError(
      422,
      "Solicite com pelo menos 48 horas de antecedência.",
    );
}
export function output(row: BookingRow) {
  return {
    id: row.id,
    source: row.source,
    seriesId: row.series_id,
    serviceId: row.service_id,
    date: row.date,
    time: clock(row.start_min),
    name: row.name,
    email: row.email,
    status: row.status,
    approvalExpiresAt: row.approval_expires_at,
    version: row.version,
  };
}
