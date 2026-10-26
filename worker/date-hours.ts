import { z } from "zod";
import { moveSchema, toMinutes, clock, today } from "./booking";
import { HttpError, type Env } from "./types";
export const dateHoursSchema = moveSchema
  .pick({ date: true })
  .extend({
    opens: z.string().regex(/^([01]\d|2[0-3]):[03]0$/),
    closes: z.string().regex(/^([01]\d|2[0-3]):[03]0$/),
    enabled: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .strict()
  .refine((d) => d.opens < d.closes);
export async function dateHours(env: Env, owner: string) {
  const rows = await env.DB.prepare(
    "SELECT date,opens,closes,enabled,version FROM date_hours WHERE professional_id=? AND date>=? ORDER BY date LIMIT 370",
  )
    .bind(owner, today())
    .all<{
      date: string;
      opens: number;
      closes: number;
      enabled: number;
      version: number;
    }>();
  return rows.results.map((r) => ({
    ...r,
    opens: clock(r.opens),
    closes: clock(r.closes),
    enabled: !!r.enabled,
  }));
}
export async function saveDateHours(
  env: Env,
  owner: string,
  data: z.infer<typeof dateHoursSchema>,
) {
  const limit = new Date(`${today()}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 366);
  if (data.date < today() || data.date > limit.toISOString().slice(0, 10))
    throw new HttpError(422, "Escolha uma data nos próximos 366 dias.");
  const q =
    data.version === 0
      ? env.DB.prepare(
          "INSERT INTO date_hours(professional_id,date,opens,closes,enabled) VALUES(?,?,?,?,?) ON CONFLICT(professional_id,date) DO NOTHING",
        ).bind(
          owner,
          data.date,
          toMinutes(data.opens),
          toMinutes(data.closes),
          Number(data.enabled),
        )
      : env.DB.prepare(
          "UPDATE date_hours SET opens=?,closes=?,enabled=?,version=version+1 WHERE professional_id=? AND date=? AND version=?",
        ).bind(
          toMinutes(data.opens),
          toMinutes(data.closes),
          Number(data.enabled),
          owner,
          data.date,
          data.version,
        );
  if (!(await q.run()).meta.changes)
    throw new HttpError(409, "A exceção mudou. Atualize a lista.");
  return dateHours(env, owner);
}
