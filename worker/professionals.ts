import { z } from "zod";
import { HttpError, type Env } from "./types";
export interface Professional {
  id: string;
  slug: string;
  display_name: string;
  header_title: string;
  header_subtitle: string;
  theme: "forest" | "navy" | "plum";
  status: "active" | "suspended" | "deleted";
  invited_email: string | null;
  google_subject: string | null;
  version: number;
  whatsapp_number: string | null;
  whatsapp_enabled: number;
}
export const brandingSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  headerTitle: z.string().trim().min(1).max(120),
  headerSubtitle: z.string().trim().max(240),
  theme: z.enum(["forest", "navy", "plum"]),
});
export const createProfessionalSchema = brandingSchema
  .extend({
    slug: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/)
      .refine((s) => !["admin", "master", "api", "demo", "login"].includes(s)),
    invitedEmail: z
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    googleSubject: z.string().trim().min(1).max(255).optional(),
  })
  .strict();
export const editProfessionalSchema = brandingSchema
  .extend({ version: z.number().int().positive() })
  .strict();
const whatsappNumber = z
  .string()
  .trim()
  .max(40)
  .refine(
    (s) => s === "" || /^\+?[0-9 ()-]+$/.test(s),
    "Informe um número com código do país.",
  )
  .transform((s) => s.replace(/[ ()-]/g, "").replace(/^\+/, "") || null)
  .refine(
    (s) => s === null || /^[1-9][0-9]{7,14}$/.test(s),
    "Informe um número com código do país.",
  )
  .nullable();
export const whatsappSchema = z
  .object({
    whatsappNumber,
    whatsappEnabled: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((d) => !d.whatsappEnabled || d.whatsappNumber !== null, {
    message: "Informe o número antes de mostrar o WhatsApp.",
    path: ["whatsappNumber"],
  });
export const professionalStatusSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    version: z.number().int().positive(),
  })
  .strict();
export const versionSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export function publicProfile(p: Professional) {
  return {
    id: p.id,
    slug: p.slug,
    displayName: p.display_name,
    headerTitle: p.header_title,
    headerSubtitle: p.header_subtitle,
    theme: p.theme,
    whatsappNumber: p.whatsapp_enabled === 1 ? p.whatsapp_number : null,
  };
}
export function privateProfile(p: Professional) {
  return {
    ...publicProfile(p),
    whatsappNumber: p.whatsapp_number ?? null,
    whatsappEnabled: p.whatsapp_enabled === 1,
    status: p.status,
    invitedEmail: p.invited_email,
    googleSubject: p.google_subject,
    version: p.version,
  };
}
export async function professionalBySlug(env: Env, slug: string) {
  const p = await env.DB.prepare(
    "SELECT * FROM professionals WHERE slug=? AND status='active'",
  )
    .bind(slug)
    .first<Professional>();
  if (!p) throw new HttpError(404, "Profissional não encontrado.");
  return p;
}
export async function professionalById(env: Env, id: string) {
  const p = await env.DB.prepare(
    "SELECT * FROM professionals WHERE id=? AND status='active'",
  )
    .bind(id)
    .first<Professional>();
  if (!p) throw new HttpError(404, "Profissional não encontrado.");
  return p;
}
export async function createProfessional(
  env: Env,
  data: z.infer<typeof createProfessionalSchema>,
  actor: string,
) {
  const p = await env.DB.prepare(
    `INSERT INTO professionals(id,slug,display_name,header_title,header_subtitle,theme,invited_email,google_subject,last_actor)
    VALUES(?,?,?,?,?,?,?,?,?) RETURNING *`,
  )
    .bind(
      crypto.randomUUID(),
      data.slug,
      data.displayName,
      data.headerTitle,
      data.headerSubtitle,
      data.theme,
      data.invitedEmail,
      data.googleSubject ?? null,
      actor,
    )
    .first<Professional>();
  return privateProfile(p!);
}
export async function editProfessional(
  env: Env,
  id: string,
  data: z.infer<typeof editProfessionalSchema>,
  actor: string,
) {
  const p = await env.DB.prepare(
    `UPDATE professionals SET display_name=?,header_title=?,header_subtitle=?,theme=?,version=version+1,last_actor=?
    WHERE id=? AND status='active' AND version=? RETURNING *`,
  )
    .bind(
      data.displayName,
      data.headerTitle,
      data.headerSubtitle,
      data.theme,
      actor,
      id,
      data.version,
    )
    .first<Professional>();
  if (!p)
    throw new HttpError(
      409,
      "O perfil mudou ou está indisponível. Atualize a página.",
    );
  return privateProfile(p);
}
export async function changeProfessionalStatus(
  env: Env,
  id: string,
  status: "active" | "suspended" | "deleted",
  version: number,
  actor: string,
) {
  const p = await env.DB.prepare(
    "UPDATE professionals SET status=?,version=version+1,last_actor=? WHERE id=? AND status!='deleted' AND version=? RETURNING *",
  )
    .bind(status, actor, id, version)
    .first<Professional>();
  if (!p)
    throw new HttpError(
      409,
      "O perfil mudou ou já foi excluído. Atualize a página.",
    );
  return privateProfile(p);
}

export async function saveWhatsApp(
  env: Env,
  id: string,
  data: z.infer<typeof whatsappSchema>,
  actor: string,
) {
  const p = await env.DB.prepare(
    `UPDATE professionals SET whatsapp_number=?,whatsapp_enabled=?,version=version+1,last_actor=?
     WHERE id=? AND status='active' AND version=? RETURNING *`,
  )
    .bind(
      data.whatsappNumber,
      data.whatsappEnabled ? 1 : 0,
      actor,
      id,
      data.version,
    )
    .first<Professional>();
  if (!p)
    throw new HttpError(
      409,
      "O perfil mudou ou está indisponível. Atualize a página.",
    );
  return privateProfile(p);
}
