import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  errorMessage,
  formatDate,
  formatDeadline,
  type Booking,
} from "../api";
type Change = {
  id: string;
  date: string;
  start_min: number;
  state: string;
  expires_at: number;
  version: number;
  replacement_id: string;
};
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function BookingChangeRequest({
  booking,
  headers,
  onChanged,
}: {
  booking: Booking;
  headers?: HeadersInit;
  onChanged: (booking: Booking) => void;
}) {
  const client = useQueryClient(),
    [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["booking-change", booking.id],
    queryFn: () =>
      api<Change | null>(`/bookings/${booking.id}/change`, { headers }),
    refetchInterval: 15000,
    enabled:
      booking.status !== "pending_approval" &&
      booking.status !== "rejected" &&
      booking.status !== "expired",
  });
  const propose = useMutation({
    mutationFn: (data: { date: string; time: string }) =>
      api(`/bookings/${booking.id}/change`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setOpen(false);
      void query.refetch();
    },
  });
  const showReplacement = useMutation({
    mutationFn: () =>
      api<Booking>(`/bookings/${query.data!.replacement_id}`, { headers }),
    onSuccess: (receipt) => {
      onChanged(receipt);
      void client.invalidateQueries({ queryKey: ["customer-bookings"] });
    },
  });
  const row = query.data,
    pending = row?.state === "pending";
  if (!row && booking.status !== "confirmed") return null;
  return (
    <section aria-label="Reagendamento">
      <h3>Mudar o horário</h3>
      {row && (
        <p role="status">
          {pending
            ? `Proposta para ${formatDate(row.date)} às ${clock(row.start_min)}, aguardando aprovação até ${formatDeadline(row.expires_at)}.`
            : row.state === "approved"
              ? "Mudança aprovada. A reserva anterior foi substituída."
              : row.state === "rejected"
                ? "Mudança recusada. O horário original foi mantido."
                : "A proposta expirou ou foi cancelada. Confira o estado da reserva original."}
        </p>
      )}
      {row?.state === "approved" && (
        <button
          disabled={showReplacement.isPending}
          onClick={() => showReplacement.mutate()}
        >
          Ver nova reserva
        </button>
      )}
      {booking.status === "confirmed" && !pending && (
        <button onClick={() => setOpen(!open)}>Propor outro horário</button>
      )}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            propose.mutate({
              date: String(data.get("date")),
              time: String(data.get("time")),
            });
          }}
        >
          <p>
            O horário atual permanece confirmado. A proposta não reserva o novo
            horário até a aprovação do profissional.
          </p>
          <label>
            Nova data
            <input required name="date" type="date" />
          </label>
          <label>
            Novo horário
            <input required name="time" type="time" step="1800" />
          </label>
          <button className="primary" disabled={propose.isPending}>
            Enviar proposta
          </button>
        </form>
      )}
      {(query.isError || propose.isError || showReplacement.isError) && (
        <p role="alert">
          {errorMessage(query.error ?? propose.error ?? showReplacement.error)}
        </p>
      )}
    </section>
  );
}
export default function BookingChanges() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "booking-changes"],
    queryFn: () =>
      api<
        (Change & {
          name: string;
          original_date: string;
          original_start: number;
        })[]
      >("/admin/booking-changes"),
    refetchInterval: 15000,
  });
  const decision = useMutation({
    mutationFn: ({
      row,
      action,
    }: {
      row: Change;
      action: "approve" | "reject";
    }) =>
      api(`/admin/booking-changes/${row.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ version: row.version }),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin"] }),
  });
  return (
    <section className="hours" aria-label="Propostas de reagendamento">
      <h3>Propostas de reagendamento</h3>
      {query.isSuccess && !query.data.length && (
        <p>Nenhuma mudança aguardando aprovação.</p>
      )}
      {query.data?.map((row) => (
        <article key={row.id}>
          <strong>{row.name}</strong>
          <p>
            Atual: {formatDate(row.original_date)} · {clock(row.original_start)}
          </p>
          <p>
            Proposto: {formatDate(row.date)} · {clock(row.start_min)}
          </p>
          <small>Responder até {formatDeadline(row.expires_at)}</small>
          <button
            disabled={decision.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Aprovar a mudança? O horário anterior só será liberado se o novo for reservado com sucesso.",
                )
              )
                decision.mutate({ row, action: "approve" });
            }}
          >
            Aprovar mudança
          </button>
          <button
            disabled={decision.isPending}
            onClick={() => {
              if (
                window.confirm("Recusar a mudança e manter o horário original?")
              )
                decision.mutate({ row, action: "reject" });
            }}
          >
            Recusar mudança
          </button>
        </article>
      ))}
      {(query.isError || decision.isError) && (
        <p role="alert">{errorMessage(query.error ?? decision.error)}</p>
      )}
    </section>
  );
}
