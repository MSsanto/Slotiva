import CustomerPrivacy from "./CustomerPrivacy";
import CustomerRecovery from "./CustomerRecovery";
import { BookingChangeRequest } from "./BookingChanges";
import { useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  api,
  servicePriceLabel,
  serviceDurationLabel,
  errorMessage,
  formatDate,
  formatDeadline,
  statusLabel,
  type Booking,
  nextDays,
  type Receipt,
  type Service,
  type ProfessionalProfile,
  publicPath,
} from "../api";

import WhatsAppContact from "./WhatsAppContact";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome.").max(100),
  email: z.email("Informe um e-mail válido.").max(200),
});
type Contact = z.infer<typeof contactSchema>;
export default function BookingPage() {
  const { slug } = useParams();
  const profile = useQuery({
    queryKey: ["public-profile", slug ?? "demo"],
    queryFn: () =>
      api<ProfessionalProfile>(
        `/public/${encodeURIComponent(slug ?? "demo")}/profile`,
      ),
    retry: false,
  });
  const queryClient = useQueryClient();
  const [serviceId, setServiceId] = useState("discovery");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [confirmed, setConfirmed] = useState<Receipt | null>(null);
  const customerHeaders = confirmed?.cancelToken
    ? { "X-Cancel-Token": confirmed.cancelToken }
    : undefined;
  const hydrated = useRef(false);
  const [accessError, setAccessError] = useState("");
  const stored = useQuery({
    queryKey: ["customer-bookings", slug ?? "demo"],
    queryFn: () =>
      api<Receipt[]>(
        `/customer/bookings?slug=${encodeURIComponent(slug ?? "demo")}`,
      ),
    retry: false,
  });
  useEffect(() => {
    if (stored.isSuccess && !hydrated.current) {
      hydrated.current = true;
      setConfirmed(
        stored.data.find(
          (b) => b.status === "pending_approval" || b.status === "confirmed",
        ) ?? null,
      );
    }
  }, [stored.isSuccess, stored.data]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "access",
    );
    if (!token) return;
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    hydrated.current = true;
    void api<{ bookingId: string }>("/customer/access", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(async (redeemed) => {
        const rows = await api<Receipt[]>(
          `/customer/bookings?slug=${encodeURIComponent(slug ?? "demo")}`,
        );
        queryClient.setQueryData(["customer-bookings", slug ?? "demo"], rows);
        setConfirmed(rows.find((b) => b.id === redeemed.bookingId) ?? null);
      })
      .catch((error) => setAccessError(errorMessage(error)));
  }, [slug, queryClient]);
  const accessLink = useMutation({
    mutationFn: () =>
      api<{ url: string; expiresIn: number }>(
        `/bookings/${confirmed!.id}/access`,
        { method: "POST", headers: customerHeaders },
      ),
  });
  const forget = useMutation({
    mutationFn: () => api("/customer/session", { method: "DELETE" }),
    onSuccess: () => {
      setConfirmed(null);
      setRescheduling(false);
      accessLink.reset();
      queryClient.removeQueries({ queryKey: ["receipt"] });
      queryClient.setQueryData(["customer-bookings", slug ?? "demo"], []);
    },
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (confirmed) heading.current?.focus();
  }, [confirmed]);
  const [rescheduling, setRescheduling] = useState(false);
  const [notice, setNotice] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Contact>({ resolver: zodResolver(contactSchema) });
  const services = useQuery({
    queryKey: ["services", slug ?? "demo"],
    queryFn: () => api<Service[]>(publicPath(slug, "services")),
  });
  const calendar = useQuery({
    queryKey: ["calendar", slug ?? "demo"],
    queryFn: () =>
      api<{ today: string; horizonDays: number }>(publicPath(slug, "calendar")),
  });
  const service =
    services.data?.find((s) => s.id === serviceId) ?? services.data?.[0];
  const selectedId = service?.id ?? "";
  const slots = useQuery({
    queryKey: [
      "availability",
      slug ?? "demo",
      date,
      selectedId,
      service?.version,
      rescheduling ? confirmed?.id : null,
    ],
    queryFn: () =>
      api<string[]>(
        rescheduling && confirmed
          ? `/bookings/${confirmed.id}/availability?date=${date}`
          : publicPath(
              slug,
              `availability?date=${date}&serviceId=${encodeURIComponent(selectedId)}`,
            ),
        rescheduling && confirmed ? { headers: customerHeaders } : {},
      ),
    enabled:
      !!date && ((!!service && service.duration !== null) || rescheduling),
  });
  const receiptState = useQuery({
    queryKey: ["receipt", confirmed?.id],
    queryFn: () =>
      api<Booking>(`/bookings/${confirmed!.id}`, {
        headers: customerHeaders,
      }),
    enabled: !!confirmed,
    refetchInterval: 15000,
    retry: false,
  });
  const current = receiptState.data ?? confirmed;
  const active =
    current?.status === "pending_approval" || current?.status === "confirmed";
  const booking = useMutation({
    mutationFn: (contact: Contact) =>
      api<Receipt>(publicPath(slug, "bookings"), {
        method: "POST",
        body: JSON.stringify({
          ...contact,
          serviceId: selectedId,
          serviceVersion: service?.version,
          date,
          time,
        }),
      }),
    onSuccess: (receipt) => {
      queryClient.removeQueries({ queryKey: ["receipt", receipt.id] });
      hydrated.current = true;
      accessLink.reset();
      setConfirmed(receipt);
      queryClient.setQueryData<Receipt[]>(
        ["customer-bookings", slug ?? "demo"],
        (old) => [receipt, ...(old ?? []).filter((b) => b.id !== receipt.id)],
      );
      setNotice("");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: () => {
      void services.refetch();
      setTime("");
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  const cancel = useMutation({
    mutationFn: () =>
      api(`/bookings/${confirmed!.id}`, {
        method: "DELETE",
        headers: customerHeaders,
      }),
    onSuccess: () => {
      setConfirmed(null);
      setRescheduling(false);
      setTime("");
      setNotice("Reserva cancelada.");
      void queryClient.invalidateQueries({
        queryKey: ["customer-bookings", slug ?? "demo"],
      });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  const move = useMutation({
    mutationFn: () =>
      api<Receipt>(`/bookings/${confirmed!.id}`, {
        method: "PUT",
        headers: customerHeaders,
        body: JSON.stringify({ date, time }),
      }),
    onSuccess: (receipt) => {
      queryClient.removeQueries({ queryKey: ["receipt", receipt.id] });
      setConfirmed(receipt);
      setRescheduling(false);
      setTime("");
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: () => {
      setTime("");
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  if (profile.isError)
    return (
      <section className="panel">
        <h2>Profissional indisponível</h2>
        <p>Confira o endereço com o profissional.</p>
      </section>
    );
  if (
    profile.isPending ||
    services.isPending ||
    calendar.isPending ||
    stored.isPending
  )
    return <p role="status">Carregando serviços e calendário…</p>;
  if (services.isError || calendar.isError)
    return (
      <section className="panel">
        <p role="alert">Não foi possível conectar à agenda.</p>
        <button
          className="primary"
          onClick={() => {
            void services.refetch();
            void calendar.refetch();
          }}
        >
          Tentar novamente
        </button>
      </section>
    );
  function schedule() {
    return (
      <fieldset>
        <legend>
          <b>2</b> Encontre um horário
        </legend>
        <div className="days" aria-label="Dias disponíveis">
          {nextDays(calendar.data!.today, calendar.data!.horizonDays).map(
            (d) => (
              <button
                type="button"
                key={d.key}
                aria-pressed={date === d.key}
                onClick={() => {
                  setDate(d.key);
                  setTime("");
                  booking.reset();
                  move.reset();
                  setNotice("");
                }}
              >
                <small>{d.weekday}</small>
                <strong>{d.day}</strong>
                <small>{d.month}</small>
              </button>
            ),
          )}
        </div>
        {!date ? (
          <p className="hint">
            Selecione um dia para ver os horários disponíveis.
          </p>
        ) : slots.isPending ? (
          <p role="status">Consultando horários…</p>
        ) : slots.isError ? (
          <div role="alert">
            Não foi possível consultar horários.{" "}
            <button type="button" onClick={() => void slots.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="slots" aria-label="Horários disponíveis">
            {slots.data?.length ? (
              slots.data.map((t) => (
                <button
                  type="button"
                  key={t}
                  aria-pressed={time === t}
                  onClick={() => setTime(t)}
                >
                  {t}
                </button>
              ))
            ) : (
              <p role="status">
                Sem horários disponíveis neste dia. Escolha outro.
              </p>
            )}
          </div>
        )}
      </fieldset>
    );
  }
  if (confirmed)
    return (
      <section className="panel confirmation">
        <div className="check" aria-hidden="true">
          {current?.status === "confirmed" ? "✓" : "…"}
        </div>
        <span className="eyebrow">
          {current && statusLabel(current.status)}
        </span>
        <h2 tabIndex={-1} ref={heading}>
          {current?.status === "confirmed"
            ? "Seu horário foi confirmado."
            : "Acompanhe sua solicitação."}
        </h2>
        <p>
          {confirmed.name},{" "}
          {current?.status === "pending_approval"
            ? "aguarde a aprovação do profissional em até 24 horas."
            : current && statusLabel(current.status)}
          .
        </p>
        {current?.status === "pending_approval" &&
          current.approvalExpiresAt && (
            <p>
              Aprovação até {formatDeadline(current.approvalExpiresAt)}{" "}
              (Brasília). Sem resposta, a solicitação expira e o horário é
              liberado.
            </p>
          )}
        {receiptState.isError && (
          <p role="alert">
            Não foi possível atualizar o estado.{" "}
            {errorMessage(receiptState.error)}
          </p>
        )}
        <label>
          Código da reserva
          <input
            readOnly
            value={confirmed.id}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="receipt">
          <strong>{confirmed.serviceName}</strong>
          <p>
            {formatDate(confirmed.date)} às {confirmed.time}
          </p>
          <p>
            {confirmed.serviceDuration} min
            {servicePriceLabel(
              confirmed.servicePriceMode,
              confirmed.servicePrice,
            ) &&
              ` · ${servicePriceLabel(confirmed.servicePriceMode, confirmed.servicePrice)}`}
          </p>
          <small>
            Horário de Brasília · A confirmação depende do profissional.
          </small>
        </div>
        <p className="hint">
          Você pode recarregar esta página: o acesso fica salvo neste navegador
          por até 30 dias. Em um computador compartilhado, encerre o acesso ao
          terminar.
        </p>
        <button
          disabled={accessLink.isPending}
          onClick={() => accessLink.mutate()}
        >
          Gerar link para outro dispositivo
        </button>
        {accessLink.data && (
          <label>
            Link de acesso — uso único, válido por 30 minutos. Guarde em local
            privado.
            <input
              readOnly
              value={accessLink.data.url}
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}
        {accessLink.isError && (
          <p role="alert">{errorMessage(accessLink.error)}</p>
        )}
        <button disabled={forget.isPending} onClick={() => forget.mutate()}>
          Encerrar acesso neste navegador
        </button>
        {forget.isError && <p role="alert">{errorMessage(forget.error)}</p>}
        {rescheduling && current?.status === "pending_approval" && (
          <div className="reschedule">
            {schedule()}
            <button
              className="primary"
              disabled={!time || move.isPending}
              onClick={() => move.mutate()}
            >
              {move.isPending ? "Salvando…" : "Alterar solicitação"}
            </button>
          </div>
        )}
        {(cancel.isError || move.isError) && (
          <p className="error" role="alert">
            {errorMessage(cancel.error || move.error)}
          </p>
        )}
        <button
          className="primary"
          disabled={cancel.isPending || move.isPending}
          onClick={() => {
            setConfirmed(null);
            setRescheduling(false);
            setTime("");
            setNotice("");
            cancel.reset();
            move.reset();
          }}
        >
          Fazer outro agendamento
        </button>
        {current?.status === "pending_approval" && (
          <button
            className="text-button"
            disabled={cancel.isPending || move.isPending}
            onClick={() => {
              setRescheduling(!rescheduling);
              setDate("");
              setTime("");
            }}
          >
            {rescheduling ? "Voltar à solicitação" : "Alterar solicitação"}
          </button>
        )}
        <BookingChangeRequest
          booking={current ?? confirmed}
          headers={customerHeaders}
          onChanged={(receipt) => {
            setConfirmed(receipt);
            setRescheduling(false);
            setTime("");
          }}
        />
        <CustomerPrivacy
          booking={current ?? confirmed}
          headers={customerHeaders}
        />
        <WhatsAppContact number={profile.data?.whatsappNumber} />
        {active && (
          <button
            className="text-button"
            disabled={cancel.isPending || move.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? "Cancelando…" : "Cancelar esta reserva"}
          </button>
        )}
      </section>
    );
  return (
    <>
      {notice && <p role="status">{notice}</p>}
      {accessError && <p role="alert">{accessError}</p>}
      {stored.isError && (
        <p role="alert">
          Não foi possível recuperar reservas deste navegador.{" "}
          <button onClick={() => void stored.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {!!stored.data?.length && (
        <section aria-label="Reservas deste navegador">
          <h2>Suas reservas</h2>
          {stored.data.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setConfirmed(b);
                setRescheduling(false);
                accessLink.reset();
              }}
            >
              {formatDate(b.date)} · {b.time} — {statusLabel(b.status)}
            </button>
          ))}
          <button disabled={forget.isPending} onClick={() => forget.mutate()}>
            Encerrar acesso neste navegador
          </button>
        </section>
      )}
      <CustomerRecovery slug={slug ?? "demo"} />
      <div className="workspace">
        <aside className="profile">
          <div className="avatar">
            {profile.data?.displayName
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
            <span />
          </div>
          <span className="eyebrow">
            {slug ? "AGENDAMENTO PROFISSIONAL" : "PROFISSIONAL DEMONSTRATIVO"}
          </span>
          <h2>{profile.data?.displayName}</h2>
          <p className="role">Atendimento com hora marcada</p>
          <p>{profile.data?.headerSubtitle}</p>
          <div className="profile-details">
            <span>
              ◷ &nbsp;{" "}
              {service
                ? serviceDurationLabel(service.duration)
                : "Duração a combinar"}
            </span>
            <span>↗ &nbsp; Atendimento on-line</span>
            <span>◎ &nbsp; Horário de Brasília</span>
          </div>
          <div className="note">
            <strong>Feito para acolher.</strong>
            <p>Você pode navegar por toda a reserva usando o teclado.</p>
          </div>
        </aside>
        <section className="panel booking">
          <div className="section-heading">
            <h2>Reserve seu momento</h2>
            <span className="step-label">3 PASSOS SIMPLES</span>
          </div>
          <p className="hint">
            Solicite com pelo menos 48 horas de antecedência. O horário só é
            confirmado após aprovação do profissional, em até 24 horas.
          </p>
          <fieldset>
            <legend>
              <b>1</b> Escolha o serviço
            </legend>
            <div className="services">
              {services.data?.map((s) => (
                <label
                  className={`service ${s.id === selectedId ? "selected" : ""}`}
                  key={s.id}
                >
                  <input
                    type="radio"
                    name="service"
                    checked={s.id === selectedId}
                    onChange={() => {
                      setServiceId(s.id);
                      setTime("");
                      booking.reset();
                    }}
                  />
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {serviceDurationLabel(s.duration)}
                      {servicePriceLabel(s.priceMode, s.price) &&
                        ` · ${servicePriceLabel(s.priceMode, s.price)}`}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <p className="hint">{service?.description}</p>
          </fieldset>
          <WhatsAppContact number={profile.data?.whatsappNumber} />
          {!services.data?.length && (
            <p role="status">
              Nenhum serviço disponível no momento. Entre em contato com o
              profissional.
            </p>
          )}
          {service?.duration === null && (
            <p role="status">
              Duração a combinar. Combine a duração e o horário diretamente com
              o profissional.
            </p>
          )}
          {service && service.duration !== null && schedule()}
          <form
            noValidate
            onSubmit={handleSubmit((contact) => {
              if (!date || !time) {
                setNotice("Selecione um dia e um horário.");
                return;
              }
              booking.mutate(contact);
            })}
          >
            <fieldset>
              <legend>
                <b>3</b> Seus dados
              </legend>
              <div className="fields">
                <label>
                  Nome
                  <input
                    {...register("name")}
                    autoComplete="name"
                    placeholder="Como podemos chamar você?"
                    maxLength={100}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "name-error" : undefined}
                  />
                  {errors.name && (
                    <span id="name-error" role="alert">
                      {errors.name.message}
                    </span>
                  )}
                </label>
                <label>
                  E-mail
                  <input
                    {...register("email")}
                    type="email"
                    autoComplete="email"
                    placeholder="voce@exemplo.com"
                    maxLength={200}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  {errors.email && (
                    <span id="email-error" role="alert">
                      {errors.email.message}
                    </span>
                  )}
                </label>
              </div>
            </fieldset>
            {booking.isError && (
              <p className="error" role="alert">
                {errorMessage(booking.error)}
              </p>
            )}
            <div className="submit-row">
              <p>
                {date && time
                  ? `${formatDate(date)} · ${time}`
                  : "Seu próximo passo começa aqui."}
                <small>Use dados fictícios neste projeto de portfólio.</small>
              </p>
              <button
                className="primary"
                type="submit"
                disabled={
                  booking.isPending ||
                  !service ||
                  service.duration === null ||
                  !date ||
                  !time ||
                  slots.isFetching
                }
              >
                {booking.isPending ? "Enviando…" : "Solicitar agendamento"}{" "}
                <span>↗</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
