import { download } from "../download";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, formatDate, type Booking } from "../api";
type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  archived: boolean;
  version: number;
  bookingCount: number;
  sharedEmail: boolean;
  emailVerifiedAt: number | null;
};
export default function ClientSettings({ bookings }: { bookings: Booking[] }) {
  const cache = useQueryClient(),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [editing, setEditing] = useState<Client | null>(null),
    [newClient, setNewClient] = useState(false);
  const query = useQuery({
    queryKey: ["admin", "clients", search, archived],
    queryFn: () =>
      api<Client[]>(
        `/admin/clients?q=${encodeURIComponent(search)}&archived=${archived}`,
      ),
  });
  const links = useQuery({
    queryKey: ["admin", "client-links"],
    queryFn: () =>
      api<{ booking_id: string; client_id: string; version: number }[]>(
        "/admin/client-links",
      ),
  });
  const requests = useQuery({
    queryKey: ["admin", "privacy"],
    queryFn: () =>
      api<
        {
          id: string;
          booking_id: string;
          kind: string;
          state: string;
          version: number;
          name: string;
        }[]
      >("/admin/privacy"),
  });
  const save = useMutation({
    mutationFn: (
      data: Omit<
        Client,
        "id" | "bookingCount" | "sharedEmail" | "emailVerifiedAt"
      >,
    ) =>
      api(editing ? `/admin/clients/${editing.id}` : "/admin/clients", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setEditing(null);
      setNewClient(false);
      void cache.invalidateQueries({ queryKey: ["admin", "clients"] });
    },
  });
  const assign = useMutation({
    mutationFn: ({
      clientId,
      bookingId,
    }: {
      clientId: string;
      bookingId: string;
    }) =>
      api(`/admin/clients/${clientId}/assign`, {
        method: "POST",
        body: JSON.stringify({
          bookingId,
          version: links.data?.find((r) => r.booking_id === bookingId)?.version,
        }),
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin"] }),
  });
  const remove = useMutation({
    mutationFn: (client: Client) =>
      api(`/admin/clients/${client.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: client.version }),
      }),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ["admin", "clients"] }),
  });
  const exportData = useMutation({
    mutationFn: (client: Client) => api(`/admin/clients/${client.id}/export`),
    onSuccess: (data, _client) => download(data, `cliente-${_client.id}.json`),
  });
  const privacy = useMutation({
    mutationFn: (r: { id: string; version: number }) =>
      api(`/admin/privacy/${r.id}`, {
        method: "PUT",
        body: JSON.stringify({ state: "reviewing", version: r.version }),
      }),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ["admin", "privacy"] }),
  });
  return (
    <section className="hours" aria-label="Cadastros de clientes">
      <h3>Clientes e contatos</h3>
      <p>
        Cadastros não são unificados por e-mail. Alterar um contato não muda os
        dados de reservas já feitas. Arquivar não cancela encontros nem apaga
        histórico.
      </p>
      <label>
        Buscar cliente por nome ou e-mail
        <input
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        Mostrar arquivados
      </label>
      <p className="hint">
        Até 200 resultados. Refine a busca quando necessário.
      </p>
      <button
        onClick={() => {
          setEditing(null);
          setNewClient(true);
        }}
      >
        Adicionar cliente
      </button>
      {(editing || newClient) && (
        <form
          key={editing?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            save.mutate({
              name: String(data.get("name")).trim(),
              email: String(data.get("email")).trim(),
              phone: String(data.get("phone")).trim(),
              archived: data.get("archived") === "on",
              version: editing?.version ?? 0,
            });
          }}
        >
          <label>
            Nome do cliente
            <input
              name="name"
              defaultValue={editing?.name}
              required
              maxLength={100}
            />
          </label>
          <label>
            E-mail do cliente
            <input type="email" name="email" defaultValue={editing?.email} />
          </label>
          <label>
            Telefone com DDI
            <input
              name="phone"
              defaultValue={editing?.phone}
              placeholder="+5511999999999"
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="archived"
              defaultChecked={editing?.archived}
            />
            Arquivado
          </label>
          <button disabled={save.isPending}>Salvar cliente</button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setNewClient(false);
            }}
          >
            Fechar edição
          </button>
        </form>
      )}
      <ul>
        {query.data?.map((client) => (
          <li key={client.id}>
            <strong>{client.name}</strong> · {client.bookingCount} reserva(s)
            <p>
              {client.email || "Sem e-mail"} —{" "}
              {client.emailVerifiedAt
                ? "Endereço confirmado por link de e-mail"
                : "E-mail não verificado"}
              {client.sharedEmail
                ? " · Endereço compartilhado entre cadastros"
                : ""}
            </p>
            {client.phone && <p>{client.phone} — telefone não verificado</p>}
            <button
              onClick={() => {
                setEditing(client);
                setNewClient(false);
              }}
            >
              Editar {client.name}
            </button>
            <button
              disabled={exportData.isPending}
              onClick={() => exportData.mutate(client)}
            >
              Exportar {client.name}
            </button>
            {client.bookingCount === 0 && (
              <button
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Excluir este cadastro sem histórico de reservas?",
                    )
                  )
                    remove.mutate(client);
                }}
              >
                Excluir cadastro sem histórico
              </button>
            )}
          </li>
        ))}
      </ul>
      {query.data?.some((c) => !c.archived) && bookings.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (
              window.confirm(
                "Associar explicitamente esta reserva ao cliente escolhido? Isso não transfere acesso à reserva.",
              )
            )
              assign.mutate({
                clientId: String(data.get("client")),
                bookingId: String(data.get("booking")),
              });
          }}
        >
          <h4>Associar uma reserva a um cadastro existente</h4>
          <label>
            Reserva para associar
            <select name="booking" required>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatDate(b.date)} · {b.time} — {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cliente da reserva
            <select name="client" required>
              {query.data
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.email || "Sem e-mail"}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={assign.isPending || links.isPending}>
            Associar reserva
          </button>
        </form>
      )}
      {!!requests.data?.length && (
        <div>
          <h4>Pedidos de privacidade</h4>
          <p>
            Analise a política de guarda e dê retorno ao cliente. Marcar em
            análise não exclui dados.
          </p>
          {requests.data.map((r) => (
            <p key={r.id}>
              {r.name}: {r.kind === "delete" ? "Exclusão" : "Exportação"} —{" "}
              {r.state === "reviewing" ? "Em análise" : "Pendente"}{" "}
              {r.state === "pending" && (
                <button
                  disabled={privacy.isPending}
                  onClick={() => privacy.mutate(r)}
                >
                  Registrar análise
                </button>
              )}
            </p>
          ))}
        </div>
      )}
      {[
        query.error,
        links.error,
        requests.error,
        save.error,
        assign.error,
        remove.error,
        exportData.error,
        privacy.error,
      ]
        .filter(Boolean)
        .map((error, index) => (
          <p key={index} role="alert">
            {errorMessage(error)}
          </p>
        ))}
    </section>
  );
}
