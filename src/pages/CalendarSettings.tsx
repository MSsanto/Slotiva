import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, formatDeadline } from "../api";
const diagnostics: Record<string, string> = {
  internal: "Ocorreu uma falha interna. Atualize o painel e tente novamente.",
  configuration:
    "A configuração da conexão precisa ser revisada pelo responsável.",
  transaction:
    "A tentativa expirou ou a sessão mudou. Reinicie a conexão neste painel.",
  consent:
    "A autorização não foi concluída no Google. Reinicie e conceda a permissão.",
  exchange: "A troca de autorização com o Google falhou. Tente novamente.",
  exchange_invalid_client:
    "O Google recusou as credenciais do aplicativo. O responsável deve conferir o cliente OAuth e seu segredo no Preview.",
  exchange_invalid_grant:
    "O Google recusou o código de autorização. Reinicie a conexão; se persistir, o responsável deve conferir o endereço de retorno.",
  exchange_unauthorized_client:
    "O cliente OAuth não está autorizado para esta operação. Solicite revisão da configuração.",
  exchange_redirect_uri_mismatch:
    "O endereço de retorno diverge da configuração OAuth. Solicite revisão do callback do Calendar.",
  grant:
    "O Google não retornou todas as credenciais necessárias. Reinicie e autorize o acesso solicitado.",
  scope:
    "A permissão de disponibilidade não foi concedida. Reinicie e marque a permissão solicitada.",
  identity:
    "Não foi possível validar a identidade retornada pelo Google. Reinicie a conexão.",
  account: "Escolha a mesma conta Google usada no painel profissional.",
  encryption:
    "Não foi possível proteger a credencial. O responsável deve revisar a chave do Calendar.",
  storage:
    "Não foi possível salvar a conexão ou o acesso foi revogado. Atualize o painel e tente novamente.",
  session:
    "Sua sessão não permitiu concluir a conexão. Entre novamente no painel profissional.",
};
type Connection = {
  enabled: boolean;
  state: "connected" | "disconnected" | "reconnect_required";
};
export default function CalendarSettings() {
  const client = useQueryClient(),
    [date, setDate] = useState("");
  const status = useQuery({
    queryKey: ["admin", "calendar"],
    queryFn: () => api<Connection>("/admin/calendar"),
    retry: false,
  });
  const busy = useMutation({
    mutationFn: () =>
      api<{ busy: { start: string; end: string }[] }>(
        `/admin/calendar/busy?date=${date}`,
      ),
    onError: () => {
      void client.invalidateQueries({ queryKey: ["admin", "calendar"] });
    },
  });
  const disconnect = useMutation({
    mutationFn: () => api("/admin/calendar", { method: "DELETE" }),
    onSuccess: () => {
      busy.reset();
      void client.invalidateQueries({ queryKey: ["admin", "calendar"] });
    },
  });
  const params = new URLSearchParams(window.location.search);
  const result = params.get("calendar");
  const reason = params.get("calendar_reason") ?? "";
  const knownReason = Object.hasOwn(diagnostics, reason);
  return (
    <section className="hours" aria-label="Conexão Google Agenda">
      <h3>Google Agenda</h3>
      <p>
        Consulte os horários ocupados na sua agenda principal, usando a mesma
        conta Google deste painel.
      </p>
      <p className="hint">
        Nesta etapa, a consulta serve para sua conferência. Os agendamentos do
        Slotiva ainda não consideram esses horários automaticamente, não criam
        eventos e não enviam convites.
      </p>
      {result === "failed" && (
        <p role="alert">
          {knownReason
            ? diagnostics[reason]
            : "Não foi possível conectar. Confira se escolheu a mesma conta do painel e concedeu a permissão solicitada; depois tente novamente."}
          {knownReason && <small> Código: {reason}</small>}
        </p>
      )}
      {status.isPending && <p role="status">Consultando conexão…</p>}
      {status.isError && (
        <p role="alert">
          {errorMessage(status.error)}{" "}
          <button onClick={() => void status.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {status.data && (
        <>
          <p role="status">
            {status.data.state === "connected"
              ? "Google Agenda conectada."
              : status.data.state === "reconnect_required"
                ? "A conexão precisa ser autorizada novamente."
                : "Google Agenda desconectada."}
          </p>
          {!status.data.enabled && (
            <p>A conexão aguarda configuração do responsável.</p>
          )}
          {status.data.enabled && (
            <form action="/api/admin/calendar/start" method="post">
              <button className="primary">
                {status.data.state === "disconnected"
                  ? "Conectar Google Agenda"
                  : "Autorizar novamente Google Agenda"}
              </button>
            </form>
          )}
          {status.data.state !== "disconnected" && (
            <button
              type="button"
              disabled={disconnect.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Desconectar Google Agenda do Slotiva? A credencial armazenada será removida. Para retirar também a permissão concedida ao Google, revise as conexões da sua conta Google.",
                  )
                )
                  disconnect.mutate();
              }}
            >
              Desconectar Google Agenda
            </button>
          )}
          {status.data.enabled && status.data.state === "connected" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                busy.mutate();
              }}
            >
              <label>
                Data para consultar no Google
                <input
                  type="date"
                  value={date}
                  required
                  onChange={(e) => {
                    setDate(e.target.value);
                    busy.reset();
                  }}
                />
              </label>
              <button
                disabled={!date || busy.isPending || disconnect.isPending}
              >
                Consultar horários ocupados
              </button>
            </form>
          )}
        </>
      )}
      {(busy.isError || disconnect.isError) && (
        <p role="alert">{errorMessage(busy.error ?? disconnect.error)}</p>
      )}
      {busy.data && (
        <div role="status">
          {busy.data.busy.length ? (
            <ul>
              {busy.data.busy.map((b, i) => (
                <li key={i}>
                  {formatDeadline(Date.parse(b.start) / 1000)} até{" "}
                  {formatDeadline(Date.parse(b.end) / 1000)} (Brasília)
                </li>
              ))}
            </ul>
          ) : (
            "Nenhum horário ocupado retornado pela Google Agenda para esta data."
          )}
        </div>
      )}
    </section>
  );
}
