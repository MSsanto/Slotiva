import EmailSettings from "./EmailSettings";
import BookingChanges from "./BookingChanges";
import DateHoursSettings from "./DateHoursSettings";
import CalendarSettings from "./CalendarSettings";
import ServiceSettings from "./ServiceSettings";
import AgreedBookings from "./AgreedBookings";
import { Navigate } from "react-router-dom";
import ProfessionalSettings from "./ProfessionalSettings";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  ApiError,
  errorMessage,
  formatDate,
  formatDeadline,
  statusLabel,
  servicePriceLabel,
  type Booking,
  type Hours,
} from "../api";
import { brasiliaDate, groupAgenda, type AgendaTab } from "../agenda";

const googleFailureMessages = new Map(
  Object.entries({
    configuration: "A configuração do acesso Google está incompleta.",
    origin: "Reinicie o acesso pelo endereço oficial desta aplicação.",
    transaction:
      "O acesso expirou ou o cookie de verificação não chegou. Reinicie nesta aba.",
    exchange:
      "Não foi possível concluir a troca com Google. O responsável deve conferir o Client ID, o Client Secret e o callback.",
    exchange_invalid_client:
      "Google recusou as credenciais da aplicação (invalid_client). O responsável deve conferir o Client Secret correspondente ao Client ID deste Preview.",
    exchange_invalid_grant:
      "Google recusou o código de autorização (invalid_grant). Reinicie o acesso nesta aba; se persistir, o responsável deve conferir o callback e o PKCE.",
    exchange_unauthorized_client:
      "O cliente OAuth não está autorizado para esta troca (unauthorized_client). O responsável deve conferir o tipo e a configuração do cliente Google.",
    exchange_redirect_uri_mismatch:
      "O endereço de retorno não corresponde ao cadastrado no Google (redirect_uri_mismatch). O responsável deve conferir o callback exato.",
    exchange_invalid_request:
      "Google recusou os parâmetros da troca (invalid_request). O responsável deve verificar a integração.",
    exchange_unavailable:
      "Não foi possível concluir a conexão com Google. Reinicie o acesso; se persistir, procure o responsável.",
    identity: "Não foi possível validar a identidade recebida do Google.",
    authorization:
      "Esta conta Google não tem acesso autorizado. Escolha a conta cadastrada pelo responsável.",
    session:
      "Não foi possível criar a sessão. O responsável deve verificar o banco de dados.",
  }),
);

export default function AdminPage() {
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [bookingTab, setBookingTab] = useState<AgendaTab>("today");
  const [futureMonth, setFutureMonth] = useState("");
  const [today, setToday] = useState(brasiliaDate);
  useEffect(() => {
    const update = () => setToday(brasiliaDate());
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const bookingTabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ role: "master" | "professional" }>("/admin/session"),
    retry: false,
  });
  const authOptions = useQuery({
    queryKey: ["auth-options"],
    queryFn: () =>
      api<{ googleEnabled: boolean; passwordEnabled: boolean }>("/auth/config"),
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
      setBookingTab("today");
      setFutureMonth("");
      client.removeQueries({ queryKey: ["admin"] });
      void client.invalidateQueries({ queryKey: ["session"] });
    },
  });
  const bookings = useQuery({
    queryKey: ["admin", "bookings"],
    queryFn: () => api<Booking[]>("/admin/bookings"),
    enabled: session.isSuccess,
    refetchInterval: 15000,
  });
  const hours = useQuery({
    queryKey: ["admin", "hours"],
    queryFn: () => api<Hours[]>("/admin/hours"),
    enabled: session.isSuccess,
  });

  const cancelSeries = useMutation({
    mutationFn: (booking: Booking) =>
      api(`/admin/series/${booking.seriesId}?scope=all`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setNotice(
        "Todos os encontros futuros desta série foram cancelados. Encontros já realizados foram preservados.",
      );
      void client.invalidateQueries({ queryKey: ["admin", "bookings"] });
      void client.invalidateQueries({ queryKey: ["availability"] });
    },
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
  const decision = useMutation({
    mutationFn: ({
      booking,
      action,
    }: {
      booking: Booking;
      action: "approve" | "reject";
    }) =>
      api<Booking>(`/admin/bookings/${booking.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ version: booking.version }),
      }),
    onSuccess: (_, { action }) => {
      setNotice(
        action === "approve"
          ? "Agendamento confirmado. Envio de e-mail e Google Agenda ainda não estão disponíveis."
          : "Solicitação recusada; horário liberado.",
      );
      void client.invalidateQueries({ queryKey: ["admin", "bookings"] });
      void client.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["admin", "bookings"] });
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
        {new URLSearchParams(window.location.search).get("google") ===
          "failed" && (
          <p role="alert">
            {googleFailureMessages.get(
              new URLSearchParams(window.location.search).get("reason") || "",
            ) ||
              "Não foi possível entrar com Google. Reinicie o acesso ou procure o responsável."}
          </p>
        )}
        {authOptions.isPending && (
          <p role="status">Verificando opções de acesso…</p>
        )}
        {authOptions.isError && (
          <p role="alert">Não foi possível consultar as opções de acesso.</p>
        )}
        {authOptions.data?.googleEnabled && (
          <form action="/api/admin/google/start" method="post">
            <button className="primary" type="submit">
              Entrar com Google
            </button>
          </form>
        )}
        {authOptions.data &&
          !authOptions.data.googleEnabled &&
          !authOptions.data.passwordEnabled && (
            <p role="alert">
              Acesso profissional aguardando configuração do responsável.
            </p>
          )}
        {authOptions.data?.passwordEnabled && (
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
        )}
        {login.isError && (
          <p className="error" role="alert">
            {errorMessage(login.error)}
          </p>
        )}
      </section>
    );
  if (session.data?.role === "master") return <Navigate to="/master" replace />;
  const groups = groupAgenda(bookings.data ?? [], today);
  const currentMonth = today.slice(0, 7);
  const selectedMonth =
    futureMonth >= currentMonth
      ? futureMonth
      : (groups.future[0]?.date.slice(0, 7) ?? currentMonth);
  const visibleBookings =
    bookingTab === "future"
      ? groups.future.filter((booking) =>
          booking.date.startsWith(`${selectedMonth}-`),
        )
      : groups[bookingTab];
  const bookingTabs = [
    { id: "today", label: "Hoje", count: groups.today.length },
    { id: "future", label: "Futuros", count: groups.future.length },
    { id: "cancelled", label: "Cancelados", count: groups.cancelled.length },
    { id: "history", label: "Histórico", count: groups.history.length },
  ] as const;
  const emptyMessages: Record<AgendaTab, string> = {
    today: "Nenhum agendamento para hoje.",
    future: "Nenhum agendamento futuro neste mês.",
    cancelled: "Nenhuma reserva cancelada.",
    history: "Nenhum agendamento anterior.",
  };
  const error =
    bookings.error ||
    hours.error ||
    cancel.error ||
    cancelSeries.error ||
    decision.error ||
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
      <p className="hint">
        Datas no horário de Brasília. Histórico mantém os agendamentos de dias
        anteriores.
      </p>
      <div
        className="booking-tabs"
        role="tablist"
        aria-label="Reservas da agenda"
        onKeyDown={(event) => {
          const current = bookingTabs.findIndex((tab) => tab.id === bookingTab);
          let next: number;
          if (event.key === "ArrowLeft")
            next = (current + bookingTabs.length - 1) % bookingTabs.length;
          else if (event.key === "ArrowRight")
            next = (current + 1) % bookingTabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = bookingTabs.length - 1;
          else return;
          event.preventDefault();
          setBookingTab(bookingTabs[next].id);
          bookingTabButtons.current[next]?.focus();
        }}
      >
        {bookingTabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`bookings-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={bookingTab === tab.id}
            aria-controls="bookings-panel"
            tabIndex={bookingTab === tab.id ? 0 : -1}
            ref={(button) => {
              bookingTabButtons.current[index] = button;
            }}
            onClick={() => setBookingTab(tab.id)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      <div
        id="bookings-panel"
        role="tabpanel"
        aria-labelledby={`bookings-tab-${bookingTab}`}
        tabIndex={0}
      >
        {bookingTab === "future" && (
          <div className="future-month">
            <label>
              Mês dos agendamentos
              <input
                type="month"
                min={currentMonth}
                value={selectedMonth}
                onChange={(event) => setFutureMonth(event.target.value)}
              />
            </label>
            {bookings.isSuccess && (
              <p className="hint" role="status">
                {visibleBookings.length}{" "}
                {visibleBookings.length === 1
                  ? "agendamento neste mês"
                  : "agendamentos neste mês"}{" "}
                · {groups.future.length} no total em Futuros.
              </p>
            )}
          </div>
        )}
        {bookings.isPending ? (
          <p role="status">Carregando reservas…</p>
        ) : bookings.isError ? null : visibleBookings.length === 0 ? (
          <p className="empty">{emptyMessages[bookingTab]}</p>
        ) : (
          visibleBookings.map((b) => (
            <article className="appointment" key={b.id}>
              <div>
                <strong>
                  {formatDate(b.date)} · {b.time}
                </strong>
                <p>
                  {b.serviceName} · {b.name}
                </p>
                <small>
                  {b.serviceDuration} min
                  {servicePriceLabel(b.servicePriceMode, b.servicePrice) &&
                    ` · ${servicePriceLabel(b.servicePriceMode, b.servicePrice)}`}
                </small>
                <p>{b.email}</p>
                <p>
                  {statusLabel(b.status)}
                  {b.seriesId ? " · Horário combinado" : ""}
                </p>
                {b.status === "pending_approval" && b.approvalExpiresAt && (
                  <small>
                    Aprovar antes de {formatDeadline(b.approvalExpiresAt)}{" "}
                    (Brasília)
                  </small>
                )}
              </div>
              <div>
                {b.date >= today && b.status === "pending_approval" && (
                  <>
                    <button
                      className="primary"
                      disabled={decision.isPending || cancel.isPending}
                      onClick={() =>
                        decision.mutate({ booking: b, action: "approve" })
                      }
                    >
                      Aprovar
                    </button>
                    <button
                      className="text-button"
                      disabled={decision.isPending || cancel.isPending}
                      onClick={() =>
                        decision.mutate({ booking: b, action: "reject" })
                      }
                    >
                      Recusar
                    </button>
                  </>
                )}
                {b.date >= today &&
                  (b.status === "confirmed" ||
                    b.status === "pending_approval") && (
                    <button
                      className="text-button"
                      disabled={
                        cancel.isPending ||
                        cancelSeries.isPending ||
                        decision.isPending
                      }
                      onClick={() => {
                        if (
                          !b.seriesId ||
                          window.confirm(
                            `Cancelar somente o encontro de ${formatDate(b.date)} às ${b.time}? Os outros encontros da série serão preservados.`,
                          )
                        )
                          cancel.mutate(b.id);
                      }}
                    >
                      {b.seriesId ? "Cancelar só esta" : "Cancelar reserva"}
                    </button>
                  )}
                {b.date >= today && b.seriesId && b.status === "confirmed" && (
                  <button
                    className="text-button"
                    disabled={cancelSeries.isPending || cancel.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Cancelar TODOS os encontros futuros desta série, inclusive os anteriores à data desta ocorrência? Encontros já realizados serão preservados.",
                        )
                      )
                        cancelSeries.mutate(b);
                    }}
                  >
                    Cancelar todas da série
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      <BookingChanges />
      <AgreedBookings />
      <DateHoursSettings />
      <EmailSettings />
      {authOptions.data?.googleEnabled && <CalendarSettings />}
      <ServiceSettings />
      <ProfessionalSettings />
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
