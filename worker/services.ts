import { z } from "zod";
import { HttpError, type Env } from "./types";
export type ServiceRow = {
  id: string;
  professional_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_mode: "free" | "paid" | "hidden";
  price_cents: number | null;
  active: number;
  version: number;
};
const fields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  duration: z.number().int().min(15).max(240).multipleOf(5),
  priceMode: z.enum(["free", "paid", "hidden"]),
  priceCents: z.number().int().min(0).max(99999999).nullable(),
  active: z.boolean(),
};
const priceValid = (d: { priceMode: string; priceCents: number | null }) =>
  d.priceMode === "free"
    ? d.priceCents === 0
    : d.priceMode === "hidden"
      ? d.priceCents === null
      : d.priceCents !== null && d.priceCents > 0;
export const createServiceSchema = z.object(fields).strict().refine(priceValid);
export const editServiceSchema = z
  .object({ ...fields, version: z.number().int().positive() })
  .strict()
  .refine(priceValid);
export function serviceOutput(s: ServiceRow) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    duration: s.duration_minutes,
    priceMode: s.price_mode,
    price: s.price_cents === null ? null : s.price_cents / 100,
    version: s.version,
    active: !!s.active,
  };
}
export async function listServices(env: Env, owner: string, admin = false) {
  const rows = await env.DB.prepare(
    `SELECT * FROM professional_services WHERE professional_id=? ${admin ? "" : "AND active=1"} ORDER BY position,id`,
  )
    .bind(owner)
    .all<ServiceRow>();
  return rows.results.map(serviceOutput);
}
export async function bookingService(
  env: Env,
  owner: string,
  id: string,
  version?: number,
) {
  const s = await env.DB.prepare(
    "SELECT * FROM professional_services WHERE professional_id=? AND id=? AND active=1",
  )
    .bind(owner, id)
    .first<ServiceRow>();
  if (!s) throw new HttpError(404, "Serviço indisponível. Atualize a página.");
  if (version !== undefined && s.version !== version)
    throw new HttpError(
      409,
      "O serviço mudou. Atualize a página e confira os novos dados.",
    );
  return s;
}
export async function saveService(
  env: Env,
  owner: string,
  actor: string,
  data: z.infer<typeof createServiceSchema> | z.infer<typeof editServiceSchema>,
  id?: string,
) {
  let row: ServiceRow | null;
  if (id && "version" in data) {
    row = await env.DB.prepare(
      "UPDATE professional_services SET name=?,description=?,duration_minutes=?,price_mode=?,price_cents=?,active=?,last_actor=?,version=version+1 WHERE professional_id=? AND id=? AND version=? RETURNING *",
    )
      .bind(
        data.name,
        data.description,
        data.duration,
        data.priceMode,
        data.priceCents,
        Number(data.active),
        actor,
        owner,
        id,
        data.version,
      )
      .first<ServiceRow>();
    if (!row)
      throw new HttpError(
        409,
        "O serviço mudou ou não está disponível. Atualize a página.",
      );
  } else {
    row = await env.DB.prepare(
      "INSERT INTO professional_services(professional_id,id,name,description,duration_minutes,price_mode,price_cents,active,last_actor,position) VALUES(?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM professional_services WHERE professional_id=?)) RETURNING *",
    )
      .bind(
        owner,
        crypto.randomUUID(),
        data.name,
        data.description,
        data.duration,
        data.priceMode,
        data.priceCents,
        Number(data.active),
        actor,
        owner,
      )
      .first<ServiceRow>();
  }
  return serviceOutput(row!);
}
