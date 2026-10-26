import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, formatDate } from "../api";
type Delivery = {
  enabled: boolean;
  jobs: {
    id: string;
    kind: string;
    state: string;
    attempts: number;
    date: string;
    start_min: number;
  }[];
};
const kinds: Record<string, string> = {
  requested: "Solicitação",
  confirmed: "Confirmação",
  cancelled: "Cancelamento",
  rejected: "Recusa",
  expired: "Expiração",
  recovery: "Recuperação de acesso",
};
const states: Record<string, string> = {
  pending: "Aguardando envio",
  accepted: "Aceito pelo provedor",
  failed: "Falha — nova tentativa pendente",
  expired: "Não enviado — prazo encerrado ou aviso substituído",
};
export default function EmailSettings() {
  const client = useQueryClient(),
    query = useQuery({
      queryKey: ["admin", "delivery"],
      queryFn: () => api<Delivery>("/admin/delivery"),
      refetchInterval: 15000,
    });
  const retry = useMutation({
    mutationFn: () => api("/admin/delivery/retry", { method: "POST" }),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin", "delivery"] }),
  });
  return (
    <section className="hours" aria-label="Avisos por e-mail">
      <h3>Avisos por e-mail</h3>
      <p>
        {query.data?.enabled
          ? "Envios habilitados. A aceitação pelo provedor não confirma que a mensagem chegou à caixa do destinatário."
          : "Os avisos próprios do Slotiva aguardam configuração do remetente. Os convites do Google Agenda continuam separados."}
      </p>
      {query.data?.enabled && (
        <button disabled={retry.isPending} onClick={() => retry.mutate()}>
          Tentar novamente envios pendentes
        </button>
      )}
      {(query.isError || retry.isError) && (
        <p role="alert">{errorMessage(query.error ?? retry.error)}</p>
      )}
      <ul>
        {query.data?.jobs?.map((job) => (
          <li key={job.id}>
            {formatDate(job.date)} — {kinds[job.kind]}: {states[job.state]}
          </li>
        ))}
      </ul>
    </section>
  );
}
