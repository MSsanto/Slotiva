import { z } from "zod";
import { digest } from "./security";
import { output } from "./booking";
import { customerBooking } from "./customer-access";
import { HttpError, type Env, type BookingRow } from "./types";
export const clientSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z
      .union([z.email().max(200), z.literal("")])
      .transform((v) => v.toLowerCase()),
    phone: z.string().regex(/^(?:\+?[1-9]\d{7,14})?$/),
    archived: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .strict();
type Client = {
  id: string;
  professional_id: string;
  name: string;
  email: string;
  phone: string;
  archived: number;
  version: number;
  booking_count: number;
  shared_email: number;
};
export async function listClients(
  env: Env,
  owner: string,
  q: string,
  archived: boolean,
) {
  const rows = await env.DB.prepare(
    "SELECT c.*,(SELECT count(*) FROM booking_clients bc WHERE bc.client_id=c.id) AS booking_count,CASE WHEN c.email!='' THEN EXISTS(SELECT 1 FROM clients other WHERE other.professional_id=c.professional_id AND other.id!=c.id AND lower(other.email)=lower(c.email) AND other.archived=0) ELSE 0 END AS shared_email FROM clients c WHERE c.professional_id=? AND c.archived=? AND (c.name LIKE ? OR c.email LIKE ?) ORDER BY c.name,c.id LIMIT 200",
  )
    .bind(owner, Number(archived), `%${q}%`, `%${q}%`)
    .all<Client>();
  const proofs = await env.DB.prepare(
    "SELECT bc.client_id,v.email_hash,v.verified_at FROM booking_clients bc JOIN clients c ON c.id=bc.client_id JOIN verified_booking_contacts v ON v.booking_id=bc.booking_id WHERE c.professional_id=?",
  )
    .bind(owner)
    .all<{ client_id: string; email_hash: string; verified_at: number }>();
  return Promise.all(
    rows.results.map(async (row) => {
      const hash = await digest(row.email.toLowerCase());
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        archived: !!row.archived,
        version: row.version,
        bookingCount: row.booking_count,
        sharedEmail: !!row.shared_email,
        emailVerifiedAt:
          proofs.results
            .filter((p) => p.client_id === row.id && p.email_hash === hash)
            .reduce((latest, p) => Math.max(latest, p.verified_at), 0) || null,
      };
    }),
  );
}
export async function saveClient(
  env: Env,
  owner: string,
  id: string | undefined,
  data: z.infer<typeof clientSchema>,
) {
  if (!id && data.version !== 0)
    throw new HttpError(422, "Novo cadastro deve começar na versão zero.");
  const result = id
    ? await env.DB.prepare(
        "UPDATE clients SET name=?,email=?,phone=?,archived=?,version=version+1 WHERE id=? AND professional_id=? AND version=?",
      )
        .bind(
          data.name,
          data.email,
          data.phone,
          Number(data.archived),
          id,
          owner,
          data.version,
        )
        .run()
    : await env.DB.prepare(
        "INSERT INTO clients(id,professional_id,name,email,phone,archived) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          owner,
          data.name,
          data.email,
          data.phone,
          Number(data.archived),
        )
        .run();
  if (!result.meta.changes)
    throw new HttpError(409, "O cadastro mudou. Atualize a lista.");
}
export async function assignClient(
  env: Env,
  owner: string,
  id: string,
  bookingId: string,
  version: number,
) {
  const changed = await env.DB.prepare(
    "UPDATE booking_clients SET client_id=?,version=version+1 WHERE booking_id=? AND version=? AND EXISTS(SELECT 1 FROM clients WHERE id=? AND professional_id=? AND archived=0) AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND professional_id=?)",
  )
    .bind(id, bookingId, version, id, owner, bookingId, owner)
    .run();
  if (!changed.meta.changes)
    throw new HttpError(404, "Cadastro ou reserva não encontrado.");
}
export async function exportClient(env: Env, owner: string, id: string) {
  const client = await env.DB.prepare(
    "SELECT id,name,email,phone,archived,created_at FROM clients WHERE id=? AND professional_id=?",
  )
    .bind(id, owner)
    .first();
  if (!client) throw new HttpError(404, "Cadastro não encontrado.");
  const bookings = await env.DB.prepare(
    "SELECT b.* FROM booking_clients bc JOIN bookings b ON b.id=bc.booking_id WHERE bc.client_id=? AND b.professional_id=? ORDER BY b.starts_at",
  )
    .bind(id, owner)
    .all<BookingRow>();
  return {
    exportedAt: new Date().toISOString(),
    client,
    bookings: bookings.results.map(output),
  };
}
export async function exportCustomerBooking(
  request: Request,
  env: Env,
  id: string,
) {
  return {
    exportedAt: new Date().toISOString(),
    booking: output(await customerBooking(request, env, id, false)),
  };
}
export async function requestPrivacy(
  request: Request,
  env: Env,
  id: string,
  kind: "export" | "delete",
) {
  const b = await customerBooking(request, env, id, false);
  await env.DB.prepare(
    "INSERT INTO privacy_requests(id,booking_id,professional_id,kind) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
  )
    .bind(crypto.randomUUID(), b.id, b.professional_id, kind)
    .run();
  return env.DB.prepare(
    "SELECT id,kind,state,requested_at FROM privacy_requests WHERE booking_id=? AND kind=? AND state!='closed'",
  )
    .bind(id, kind)
    .first();
}
export async function privacyRequests(env: Env, owner: string) {
  const rows = await env.DB.prepare(
    "SELECT r.id,r.kind,r.state,r.version,r.requested_at,b.id AS booking_id,b.name,b.email FROM privacy_requests r JOIN bookings b ON b.id=r.booking_id WHERE r.professional_id=? AND r.state!='closed' ORDER BY r.requested_at",
  )
    .bind(owner)
    .all();
  return rows.results;
}
