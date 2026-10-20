import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  ApiError,
  errorMessage,
  formatDate,
  type Booking,
  type Hours,
  type Service,
} from "../api";
export default function AdminPage() {
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api("/admin/session"),
    retry: false,
  });
  const login = useMutation({
    mutationFn: () =>
      api("/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      setPassword("");
      void client.invalidateQueries({ queryKey: ["session"] });
    },
  });
  const logout = useMutation({
    mutationFn: () => api("/admin/logout", { method: "POST" }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["admin"] });
      void client.invalidateQueries({ queryKey: ["session"] });
    },
  });
  const bookings = useQuery({
    queryKey: ["admin", "bookings"],
    queryFn: () => api<Booking[]>("/admin/bookings"),
    enabled: session.isSuccess,
  });
  const hours = useQuery({
    queryKey: ["admin", "hours"],
    queryFn: () => api<Hours[]>("/admin/hours"),
    enabled: session.isSuccess,
  });
  const services = useQuery({
    queryKey: ["services"],
    queryFn: () => api<Service[]>("/services"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/bookings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setNotice("Reserva cancelada.");
      void client.invalidateQueries({ queryKey: ["admin", "bookings"] });
      void client.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  const updateHours = useMutation({
    mutationFn: (data: { weekdays: number[]; opens: string; closes: string }) =>
      api("/admin/hours", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      setNotice("Expediente atualizado.");
      void client.invalidateQueries({ queryKey: ["admin", "hours"] });
      void client.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  if (session.isPending) return <p role="status">Verificando sessão…</p>;
  if (session.isError)
    return (
      <section className="panel login">
        <h2>Acesso do profissional</h2>
        {!(
          session.error instanceof ApiError && session.error.status === 401
        ) && <p role="alert">{errorMessage(session.error)}</p>}
        <p>A agenda e os dados dos clientes exigem autenticação.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <label>
            Senha administrativa
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              maxLength={200}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={login.isPending}>
            {login.isPending ? "Entrando…" : "Entrar"}
          </button>
        </form>
        {login.isError && (
          <p className="error" role="alert">
            {errorMessage(login.error)}
          </p>
        )}
      </section>
    );
  const error =
    bookings.error ||
    hours.error ||
    cancel.error ||
    updateHours.error ||
    logout.error;
  return (
    <section className="panel admin">
      <div className="section-heading">
        <h2>Minha agenda</h2>
        <button
          className="text-button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Sair
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {errorMessage(error)}{" "}
          <button
            onClick={() => {
              void client.invalidateQueries({ queryKey: ["session"] });
              void client.invalidateQueries({ queryKey: ["admin"] });
            }}
          >
            Atualizar
          </button>
        </p>
      )}
      {bookings.isPending ? (
        <p role="status">Carregando reservas…</p>
      ) : bookings.data?.length === 0 ? (
        <p className="empty">Sua agenda está livre.</p>
      ) : (
        bookings.data?.map((b) => (
          <article className="appointment" key={b.id}>
            <div>
              <strong>
                {formatDate(b.date)} · {b.time}
              </strong>
              <p>
                {services.data?.find((s) => s.id === b.serviceId)?.name} ·{" "}
                {b.name}
              </p>
              <small>{b.email}</small>
            </div>
            <button
              className="text-button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(b.id)}
            >
              Cancelar reserva
            </button>
          </article>
        ))
      )}
      {hours.data && (
        <form
          key={JSON.stringify(hours.data)}
          className="hours"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setNotice("");
            updateHours.mutate({
              weekdays: data.getAll("weekday").map(Number),
              opens: String(data.get("opens")),
              closes: String(data.get("closes")),
            });
          }}
        >
          <h3>Disponibilidade semanal</h3>
          <p className="hint">
            Horário de Brasília. Intervalos de 30 minutos e 15 minutos de pausa
            após cada atendimento.
          </p>
          <fieldset>
            <legend>Dias de atendimento</legend>
            <div className="weekdays">
              {[
                "Segunda",
                "Terça",
                "Quarta",
                "Quinta",
                "Sexta",
                "Sábado",
                "Domingo",
              ].map((day, i) => (
                <label key={day}>
                  <input
                    name="weekday"
                    type="checkbox"
                    value={i}
                    defaultChecked={hours.data?.some((h) => h.weekday === i)}
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="fields">
            <label>
              Abertura
              <input
                name="opens"
                type="time"
                step={1800}
                required
                defaultValue={hours.data[0]?.opens || "09:00"}
              />
            </label>
            <label>
              Encerramento
              <input
                name="closes"
                type="time"
                step={1800}
                required
                defaultValue={hours.data[0]?.closes || "17:00"}
              />
            </label>
          </div>
          <button className="primary" disabled={updateHours.isPending}>
            {updateHours.isPending ? "Salvando…" : "Salvar expediente"}
          </button>
        </form>
      )}
    </section>
  );
}
