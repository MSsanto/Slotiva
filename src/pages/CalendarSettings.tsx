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
  exchange_redirect_blocked:
    "A conexão foi interrompida porque o serviço tentou redirecionar a troca de credenciais. O responsável deve revisar a integração.",
  exchange_unavailable:
    "Não foi possível concluir a comunicação com o Google. Aguarde e reinicie a conexão.",
  exchange_invalid_request:
    "O Google recusou o formato da solicitação de autorização. O responsável deve revisar a integração do Calendar.",
  exchange_invalid_scope:
    "O Google recusou o escopo solicitado. O responsável deve revisar a permissão de disponibilidade do Calendar.",
  exchange_unsupported_grant_type:
    "O Google recusou o tipo de troca de autorização. O responsável deve revisar a integração OAuth.",
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
    "As permissões de consulta e edição de eventos não foram concedidas. Reinicie e marque a permissão solicitada.",
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
  mode: "availability_only" | "event_sync";
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
  const syncStatus = useQuery({
    queryKey: ["admin", "calendar", "sync"],
    queryFn: () =>
      api<
        {
          id: string;
          date: string;
          start_min: number;
          state: string;
          last_error: string | null;
        }[]
      >("/admin/calendar/sync"),
    enabled: status.data?.mode === "event_sync",
    refetchInterval: 15000,
  });
  const sync = useMutation({
    mutationFn: () => api("/admin/calendar/sync", { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "calendar"] });
    },
  });
  const reconcile=useMutation({
    mutationFn:()=>api("/admin/calendar/reconcile",{method:"POST"}),
    onSuccess:()=>{void client.invalidateQueries({queryKey:["admin","calendar"]});},
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
  const http = params.get("calendar_http") ?? "";
  const showHttp =
    knownReason &&
    reason.startsWith("exchange") &&
    /^[345][0-9]{2}$/.test(http);
  return (
    <section className="hours" aria-label="Conexão Google Agenda">
      <h3>Google Agenda</h3>
      <p>
        Consulte os horários ocupados na sua agenda principal, usando a mesma
        conta Google deste painel.
      </p>
      <p className="hint">
        Autorize a sincronização para enviar encontros confirmados à sua agenda
        principal e convidar o cliente por e-mail, quando informado.
        Cancelamentos feitos no Slotiva serão enviados ao Google. Altere as
        reservas pelo Slotiva; alterações feitas diretamente no Google não são
        importadas.
      </p>
      {result === "failed" && (
        <p role="alert">
          {knownReason
            ? diagnostics[reason]
            : "Não foi possível conectar. Confira se escolheu a mesma conta do painel e concedeu a permissão solicitada; depois tente novamente."}
          {knownReason && (
            <small>
              {" "}
              Código: {reason}
              {showHttp ? ` · HTTP ${http}` : ""}
            </small>
          )}
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
          {status.data.state === "connected" &&
            status.data.mode === "availability_only" && (
              <p role="status">
                Sua autorização atual permite apenas consulta. Autorize
                novamente para criar eventos e enviar convites.
              </p>
            )}
          {status.data.state === "connected" &&
            status.data.mode === "event_sync" && (
              <div>
                <p>
                  Sincronização habilitada. Reservas futuras já confirmadas
                  também serão enviadas. A confirmação consulta conflitos no
                  Google. Os horários ocupados também são retirados da página
                  pública de agendamento.
                </p>
                <button disabled={sync.isPending} onClick={() => sync.mutate()}>
                  {sync.isPending ? "Sincronizando…" : "Sincronizar agora"}
                </button>
                <button disabled={reconcile.isPending||sync.isPending} onClick={()=>reconcile.mutate()}>Conferir alterações no Google</button>
                <p className="hint">A conferência sinaliza eventos alterados ou excluídos diretamente no Google. Revise a reserva no Slotiva; alterações externas não são importadas automaticamente.</p>
                {reconcile.isError&&<p role="alert">{errorMessage(reconcile.error)}</p>}
                {sync.isError && <p role="alert">{errorMessage(sync.error)}</p>}
                {syncStatus.isError && (
                  <p role="alert">{errorMessage(syncStatus.error)}</p>
                )}
                {syncStatus.data && (
                  <ul>
                    {syncStatus.data.map((j) => (
                      <li key={j.id}>
                        {j.date.split("-").reverse().join("/")} ·{" "}
                        {String(Math.floor(j.start_min / 60)).padStart(2, "0")}:
                        {String(j.start_min % 60).padStart(2, "0")} —{" "}
                        {j.state === "synced"
                          ? "Sincronizado"
                          : j.state === "skipped"
                            ? "Não enviado: encontro já iniciado"
                            : j.last_error === "conflict"
                              ? "Conflito no Google: revise o horário. A reserva continua confirmada no Slotiva."
                              : j.last_error === "event_changed"
                                ? "Evento alterado ou excluído no Google. Revise a reserva."
                                : j.last_error === "connection"
                                  ? "Autorize novamente com a conta original."
                                  : j.state === "failed"
                                    ? "Falha no envio. Uma nova tentativa será feita."
                                    : "Aguardando sincronização"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
