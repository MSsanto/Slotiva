export type Service = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number | null;
  priceMode: "free" | "paid" | "hidden";
  version: number;
  active: boolean;
};
export type Booking = {
  source?: "public" | "professional";
  seriesId?: string | null;
  id: string;
  serviceId: string;
  serviceName: string;
  serviceDescription: string;
  serviceDuration: number;
  servicePriceMode: Service["priceMode"];
  servicePrice: number | null;
  serviceVersion: number;
  date: string;
  time: string;
  name: string;
  email: string;
  status:
    "pending_approval" | "confirmed" | "rejected" | "expired" | "cancelled";
  approvalExpiresAt: number | null;
  version: number;
};
export type Receipt = Booking & { cancelToken: string };
export type Hours = { weekday: number; opens: string; closes: string };
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof body.detail === "string"
        ? body.detail
        : "Não foi possível concluir. Confira os dados e tente novamente.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Falha na conexão. Tente novamente.";
export function nextDays(today: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return {
      key: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      weekday: d.toLocaleDateString("pt-BR", {
        weekday: "short",
        timeZone: "UTC",
      }),
      month: d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }),
    };
  });
}
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export const statusLabel = (status: Booking["status"]) =>
  ({
    pending_approval: "Aguardando aprovação — ainda não confirmado",
    confirmed: "Confirmado pelo profissional",
    rejected: "Solicitação recusada",
    expired: "Solicitação expirada — horário liberado",
    cancelled: "Cancelado",
  })[status];
export const formatDeadline = (seconds: number) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(seconds * 1000));

export type ProfessionalProfile = {
  id: string;
  slug: string;
  displayName: string;
  headerTitle: string;
  headerSubtitle: string;
  theme: "forest" | "navy" | "plum";
};
export type ManagedProfessional = ProfessionalProfile & {
  status: "active" | "suspended" | "deleted";
  invitedEmail: string | null;
  googleSubject: string | null;
  version: number;
};
export const publicPath = (slug: string | undefined, resource: string) =>
  slug ? `/public/${encodeURIComponent(slug)}/${resource}` : `/${resource}`;

export const servicePriceLabel = (
  mode: Service["priceMode"],
  price: number | null,
) =>
  mode === "hidden"
    ? ""
    : mode === "free"
      ? "Gratuito"
      : new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(price ?? 0);
