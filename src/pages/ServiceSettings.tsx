import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  errorMessage,
  servicePriceLabel,
  serviceDurationLabel,
  type Service,
} from "../api";
function ServiceForm({
  service,
  done,
}: {
  service?: Service;
  done: (saved: boolean) => void;
}) {
  const client = useQueryClient();
  const [mode, setMode] = useState<Service["priceMode"]>(
    service?.priceMode ?? "hidden",
  );
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api<Service>(
        `/admin/services${service ? `/${encodeURIComponent(service.id)}` : ""}`,
        {
          method: service ? "PUT" : "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "services"] }),
        client.invalidateQueries({ queryKey: ["services"] }),
        client.invalidateQueries({ queryKey: ["availability"] }),
      ]);
      done(true);
    },
  });
  return (
    <form
      className="hours"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const amount = String(f.get("price") ?? "").trim();
        const duration = String(f.get("duration") ?? "").trim();
        save.mutate({
          name: String(f.get("name")),
          description: String(f.get("description")),
          duration: duration === "" ? null : Number(duration),
          priceMode: mode,
          priceCents:
            mode === "hidden"
              ? null
              : mode === "free"
                ? 0
                : amount === ""
                  ? null
                  : Math.round(Number(amount) * 100),
          active: f.get("active") === "on",
          ...(service ? { version: service.version } : {}),
        });
      }}
    >
      <h4>{service ? `Editar ${service.name}` : "Novo serviço"}</h4>
      <label>
        Nome do serviço
        <input
          name="name"
          defaultValue={service?.name}
          required
          maxLength={100}
        />
      </label>
      <label>
        Descrição
        <textarea
          name="description"
          defaultValue={service?.description}
          maxLength={500}
          rows={3}
        />
      </label>
      <div className="fields">
        <label>
          Duração (minutos, opcional)
          <input
            name="duration"
            type="number"
            min={15}
            max={240}
            step={5}
            defaultValue={service?.duration ?? ""}
          />
        </label>
        <label>
          Exibição do valor
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Service["priceMode"])}
          >
            <option value="hidden">Não divulgar valor</option>
            <option value="free">Gratuito</option>
            <option value="paid">Pago · valor opcional</option>
          </select>
        </label>
        {mode === "paid" && (
          <label>
            Valor (R$, opcional)
            <input
              name="price"
              type="number"
              min={0.01}
              max={999999.99}
              step={0.01}
              defaultValue={
                service?.priceMode === "paid" ? (service.price ?? "") : ""
              }
            />
          </label>
        )}
      </div>
      <label>
        <input
          name="active"
          type="checkbox"
          defaultChecked={service?.active ?? true}
        />{" "}
        Disponível para novos agendamentos
      </label>
      <p className="hint">
        A alteração vale para novos agendamentos. Reservas existentes mantêm o
        serviço, a duração e o valor originais. O intervalo entre atendimentos
        continua em 15 minutos. Duração e valor podem ficar em branco para
        combinar depois. Sem duração definida, combine o horário diretamente e
        informe o tempo ao cadastrar o encontro.
      </p>
      {save.isError && (
        <p role="alert">
          {errorMessage(save.error)} Feche e reabra a edição para carregar a
          versão atual.
        </p>
      )}
      <button className="primary" disabled={save.isPending}>
        {save.isPending ? "Salvando…" : "Salvar serviço"}
      </button>
      <button
        type="button"
        disabled={save.isPending}
        onClick={() => done(false)}
      >
        Fechar edição
      </button>
    </form>
  );
}
export default function ServiceSettings() {
  const services = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => api<Service[]>("/admin/services"),
  });
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section className="hours" aria-label="Configuração de serviços">
      <h3>Seus serviços</h3>
      <p>
        Personalize os tipos de atendimento, a descrição, o tempo e a exibição
        do valor na sua página.
      </p>
      {services.isPending && <p role="status">Carregando serviços…</p>}
      {services.isError && (
        <p role="alert">
          {errorMessage(services.error)}{" "}
          <button onClick={() => void services.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {services.data?.map((s) => (
        <div key={s.id} className="service-setting">
          <p>
            <strong>{s.name}</strong> · {serviceDurationLabel(s.duration)}
            {servicePriceLabel(s.priceMode, s.price) &&
              ` · ${servicePriceLabel(s.priceMode, s.price)}`}{" "}
            · {s.active ? "Ativo" : "Desativado"}
          </p>
          <button
            type="button"
            disabled={editing !== null}
            onClick={() => {
              setSaved(false);
              setEditing(s);
            }}
          >
            Editar {s.name}
          </button>
        </div>
      ))}
      {!editing && (
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setEditing("new");
          }}
        >
          Adicionar serviço
        </button>
      )}
      {editing && (
        <ServiceForm
          key={editing === "new" ? "new" : editing.id}
          service={editing === "new" ? undefined : editing}
          done={(changed) => {
            setEditing(null);
            setSaved(changed);
            void services.refetch();
          }}
        />
      )}
      {saved && <p role="status">Lista de serviços atualizada.</p>}
    </section>
  );
}
