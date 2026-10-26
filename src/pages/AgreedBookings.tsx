import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, serviceDurationLabel, type Service } from "../api";
export default function AgreedBookings() {
  const client = useQueryClient();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [frequency, setFrequency] = useState("weekly");
  const [saved, setSaved] = useState("");
  const services = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => api<Service[]>("/admin/services"),
  });
  const [selectedId, setSelectedId] = useState("");
  const activeServices = services.data?.filter((s) => s.active) ?? [];
  const service =
    activeServices.find((s) => s.id === selectedId) ?? activeServices[0];
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api<{ bookings: unknown[] }>("/admin/series", {
        method: "POST",
        body: JSON.stringify({ ...data, requestId }),
      }),
    onError: () => {
      void services.refetch();
    },
    onSuccess: (data) => {
      setSaved(
        `${data.bookings.length} encontro(s) confirmado(s) na agenda. Acompanhe o envio de avisos e convites nos painéis de integração.`,
      );
      setRequestId(crypto.randomUUID());
      void client.invalidateQueries({ queryKey: ["admin", "bookings"] });
      void client.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  return (
    <form
      className="hours"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved("");
        const data = new FormData(e.currentTarget);
        save.mutate({
          name: String(data.get("name")),
          email: String(data.get("email")),
          serviceId: String(data.get("serviceId")),
          serviceVersion: services.data?.find(
            (s) => s.id === data.get("serviceId"),
          )?.version,
          ...(service?.duration === null
            ? { duration: Number(data.get("duration")) }
            : {}),
          date: String(data.get("date")),
          time: String(data.get("time")),
          frequency,
          count: frequency === "once" ? 1 : Number(data.get("count")),
        });
      }}
    >
      <h3>Horário combinado com o cliente</h3>
      <p>
        Cadastre um encontro ou uma sequência semanal ou quinzenal já combinada.
        Todos ficam confirmados, sem etapa de aprovação.
      </p>
      <p className="hint">
        Até 26 encontros, dentro dos próximos 366 dias, no horário de Brasília.
        O intervalo de 15 minutos e seu expediente serão respeitados. Um
        conflito impede o cadastro inteiro. A série termina na quantidade
        informada; não há renovação automática.
      </p>
      <label>
        Nome ou identificação do cliente
        <input name="name" required maxLength={100} />
      </label>
      <label>
        E-mail (opcional)
        <input name="email" type="email" maxLength={200} />
      </label>
      <label>
        Tipo de encontro
        <select
          name="serviceId"
          required
          value={service?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {services.data
            ?.filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {serviceDurationLabel(s.duration)}
              </option>
            ))}
        </select>
      </label>
      {service?.duration === null && (
        <label>
          Duração deste encontro (minutos)
          <input
            name="duration"
            type="number"
            min={15}
            max={240}
            step={5}
            required
          />
          <small>
            Como o serviço não tem duração fixa, informe o tempo combinado para
            este encontro ou série.
          </small>
        </label>
      )}
      <div className="fields">
        <label>
          Primeira data
          <input name="date" type="date" required />
        </label>
        <label>
          Horário fixo
          <input name="time" type="time" required step={1800} />
        </label>
      </div>
      <div className="fields">
        <label>
          Frequência
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          >
            <option value="once">Uma vez</option>
            <option value="weekly">Semanal · a cada 7 dias</option>
            <option value="fortnightly">Quinzenal · a cada 14 dias</option>
          </select>
        </label>
        {frequency !== "once" && (
          <label>
            Quantidade de encontros
            <input
              name="count"
              type="number"
              min={1}
              max={26}
              defaultValue={12}
              required
            />
          </label>
        )}
      </div>
      <p className="hint">
        Use apenas os dados necessários para agendar. Não registre diagnóstico,
        prontuário ou conteúdo de sessões.
      </p>
      <button
        className="primary"
        disabled={save.isPending || !services.data?.some((s) => s.active)}
      >
        {save.isPending ? "Cadastrando…" : "Confirmar encontros combinados"}
      </button>
      {save.isError && (
        <p role="alert">
          {errorMessage(save.error)} Se alterar os dados após uma falha de rede,
          inicie uma nova tentativa antes de salvar.
        </p>
      )}
      {save.isError && (
        <button
          type="button"
          onClick={() => {
            setRequestId(crypto.randomUUID());
            save.reset();
          }}
        >
          Iniciar nova tentativa
        </button>
      )}
      {saved && <p role="status">{saved}</p>}
    </form>
  );
}
