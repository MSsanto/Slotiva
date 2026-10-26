import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, formatDate } from "../api";
type Exception = {
  date: string;
  opens: string;
  closes: string;
  enabled: boolean;
  version: number;
};
export default function DateHoursSettings() {
  const client = useQueryClient(),
    [date, setDate] = useState("");
  const query = useQuery({
    queryKey: ["admin", "date-hours"],
    queryFn: () => api<Exception[]>("/admin/date-hours"),
  });
  const save = useMutation({
    mutationFn: (data: Exception) =>
      api("/admin/date-hours", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      setDate("");
      void client.invalidateQueries({ queryKey: ["admin", "date-hours"] });
    },
  });
  const remove = useMutation({
    mutationFn: (row: Exception) =>
      api("/admin/date-hours", {
        method: "DELETE",
        body: JSON.stringify({ date: row.date, version: row.version }),
      }),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin", "date-hours"] }),
  });
  const existing = query.data?.find((r) => r.date === date);
  return (
    <section className="hours" aria-label="Exceções de expediente">
      <h3>Expediente por data</h3>
      <p>
        Defina feriados, folgas ou um horário diferente para uma data. Reservas
        existentes precisam caber no novo expediente.
      </p>
      {query.isError && <p role="alert">{errorMessage(query.error)}</p>}
      <label>
        Data da exceção
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {date && (
        <form
          key={date + existing?.version}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            save.mutate({
              date,
              opens: String(data.get("opens")),
              closes: String(data.get("closes")),
              enabled: data.get("enabled") === "on",
              version: existing?.version ?? 0,
            });
          }}
        >
          <label>
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={existing?.enabled ?? false}
            />
            Atender nesta data
          </label>
          <label>
            Abre às
            <input
              type="time"
              name="opens"
              step="1800"
              defaultValue={existing?.opens ?? "09:00"}
              required
            />
          </label>
          <label>
            Fecha às
            <input
              type="time"
              name="closes"
              step="1800"
              defaultValue={existing?.closes ?? "17:00"}
              required
            />
          </label>
          <button className="primary" disabled={save.isPending}>
            Salvar exceção
          </button>
        </form>
      )}
      {(save.isError || remove.isError) && (
        <p role="alert">{errorMessage(save.error ?? remove.error)}</p>
      )}
      <ul>
        {query.data?.map((row) => (
          <li key={row.date}>
            {formatDate(row.date)} —{" "}
            {row.enabled ? `${row.opens} às ${row.closes}` : "Sem atendimento"}{" "}
            <button
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Remover a exceção e voltar ao expediente semanal?",
                  )
                )
                  remove.mutate(row);
              }}
            >
              Voltar ao expediente semanal
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
