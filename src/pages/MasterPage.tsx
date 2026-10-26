import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, type ManagedProfessional } from "../api";
export default function MasterPage() {
  const cache = useQueryClient(),
    [editing, setEditing] = useState<ManagedProfessional | null>(null),
    [showDeleted, setShowDeleted] = useState(false),
    [formVersion, setFormVersion] = useState(0),
    [notice, setNotice] = useState("");
  const session = useQuery({
    queryKey: ["master-session"],
    queryFn: () => api("/master/session"),
    retry: false,
  });
  const config = useQuery({
    queryKey: ["auth-options"],
    queryFn: () => api<{ googleEnabled: boolean }>("/auth/config"),
  });
  const professionals = useQuery({
    queryKey: ["master-professionals", showDeleted ? "deleted" : "current"],
    queryFn: () =>
      api<ManagedProfessional[]>(
        `/master/professionals${showDeleted ? "?status=deleted" : ""}`,
      ),
    enabled: session.isSuccess,
  });
  const refresh = () => {
    setEditing(null);
    void cache.invalidateQueries({ queryKey: ["master-professionals"] });
    void cache.invalidateQueries({ queryKey: ["public-profile"] });
  };
  const save = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: unknown }) =>
      api(`/master/professionals${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(data),
      }),
    onMutate: () => setNotice(""),
    onSuccess: (_result, variables) => {
      if (!variables.id) setFormVersion((n) => n + 1);
      setShowDeleted(false);
      setNotice(
        variables.id ? "Cabeçalho atualizado." : "Profissional criado.",
      );
      refresh();
    },
  });
  const restore = useMutation({
    mutationFn: (p: ManagedProfessional) =>
      api(`/master/professionals/${p.id}/restore`, {
        method: "POST",
        body: JSON.stringify({ version: p.version }),
      }),
    onMutate: () => setNotice(""),
    onSuccess: () => {
      setNotice(
        "Cadastro restaurado. O profissional precisa entrar novamente. Reservas canceladas não foram reativadas.",
      );
      setShowDeleted(false);
      refresh();
    },
  });
  const state = useMutation({
    mutationFn: ({
      p,
      action,
    }: {
      p: ManagedProfessional;
      action: "active" | "suspended" | "deleted";
    }) =>
      api(
        `/master/professionals/${p.id}${action === "deleted" ? "" : "/status"}`,
        {
          method: action === "deleted" ? "DELETE" : "PUT",
          body: JSON.stringify(
            action === "deleted"
              ? { version: p.version }
              : { status: action, version: p.version },
          ),
        },
      ),
    onMutate: () => setNotice(""),
    onSuccess: refresh,
  });
  const logout = useMutation({
    mutationFn: () => api("/admin/logout", { method: "POST" }),
    onSuccess: () => {
      cache.removeQueries({ queryKey: ["master-professionals"] });
      void cache.invalidateQueries({ queryKey: ["master-session"] });
      void cache.invalidateQueries({ queryKey: ["session"] });
    },
  });
  if (session.isPending) return <p role="status">Verificando administração…</p>;
  if (session.isError)
    return (
      <section className="panel login">
        <h2>Administração master</h2>
        <p>Somente o responsável autorizado administra profissionais.</p>
        {config.data?.googleEnabled ? (
          <form action="/api/admin/google/start" method="post">
            <button className="primary">Entrar com Google</button>
          </form>
        ) : (
          <p>Acesso Google aguardando configuração.</p>
        )}
        <p role="alert">{errorMessage(session.error)}</p>
      </section>
    );
  return (
    <section className="panel admin">
      <div className="section-heading">
        <h2>Administração master</h2>
        <button onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sair
        </button>
      </div>
      <p>
        Excluir retira a página do ar, revoga acessos e cancela reservas ativas.
        O histórico fica em Excluídos, onde o cadastro pode ser restaurado.
      </p>
      {notice && <p role="status">{notice}</p>}
      {(professionals.error ||
        restore.error ||
        state.error ||
        logout.error) && (
        <p role="alert">
          {errorMessage(
            professionals.error || restore.error || state.error || logout.error,
          )}
        </p>
      )}
      <form
        className="hours"
        key={editing?.id ?? `new-${formVersion}`}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const branding = {
            displayName: d.get("displayName"),
            headerTitle: d.get("headerTitle"),
            headerSubtitle: d.get("headerSubtitle"),
            theme: d.get("theme"),
          };
          save.mutate(
            editing
              ? {
                  id: editing.id,
                  data: { ...branding, version: editing.version },
                }
              : {
                  data: {
                    ...branding,
                    slug: d.get("slug"),
                    invitedEmail: d.get("invitedEmail"),
                    ...(d.get("googleSubject")
                      ? { googleSubject: d.get("googleSubject") }
                      : {}),
                  },
                },
          );
        }}
      >
        <h3>{editing ? "Editar cabeçalho" : "Criar profissional"}</h3>
        <label>
          Nome profissional
          <input
            name="displayName"
            defaultValue={editing?.displayName}
            required
            maxLength={100}
          />
        </label>
        {!editing && (
          <>
            <label>
              Endereço público
              <input
                name="slug"
                placeholder="ana-costa"
                required
                minLength={3}
                maxLength={48}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </label>
            <label>
              E-mail Google convidado
              <input
                name="invitedEmail"
                type="email"
                required
                maxLength={200}
              />
            </label>
            <label>
              Identificador Google (opcional)
              <input name="googleSubject" maxLength={255} />
            </label>
            <p className="hint">
              Sem identificador, a primeira conta Gmail ou Workspace verificada
              vincula o convite. E-mail compartilhado não pode criar dois
              acessos.
            </p>
          </>
        )}
        <label>
          Título do cabeçalho
          <input
            name="headerTitle"
            defaultValue={editing?.headerTitle}
            required
            maxLength={120}
          />
        </label>
        <label>
          Subtítulo
          <input
            name="headerSubtitle"
            defaultValue={editing?.headerSubtitle}
            maxLength={240}
          />
        </label>
        <label>
          Tema
          <select name="theme" defaultValue={editing?.theme ?? "forest"}>
            <option value="forest">Verde</option>
            <option value="navy">Azul</option>
            <option value="plum">Ameixa</option>
          </select>
        </label>
        <button className="primary" disabled={save.isPending}>
          {editing ? "Salvar cabeçalho" : "Criar profissional"}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(null)}>
            Voltar à criação
          </button>
        )}
        {save.isError && (
          <p role="alert">
            {errorMessage(save.error)} Se o cadastro foi excluído, procure-o em
            Excluídos.
          </p>
        )}
      </form>
      <div role="group" aria-label="Filtrar profissionais">
        <button
          type="button"
          aria-pressed={!showDeleted}
          onClick={() => setShowDeleted(false)}
        >
          Ativos e suspensos
        </button>
        <button
          type="button"
          aria-pressed={showDeleted}
          onClick={() => setShowDeleted(true)}
        >
          Excluídos
        </button>
      </div>
      {showDeleted && (
        <p>
          Restaure o cadastro para reutilizar seu endereço e identidade. As
          reservas canceladas permanecem no histórico.
        </p>
      )}
      {professionals.isSuccess && professionals.data.length === 0 && (
        <p>
          {showDeleted
            ? "Nenhum cadastro excluído."
            : "Nenhum profissional cadastrado."}
        </p>
      )}
      {professionals.isPending ? (
        <p role="status">Carregando profissionais…</p>
      ) : (
        professionals.data?.map((p) => (
          <article className="appointment" key={p.id}>
            <div>
              <strong>{p.displayName}</strong>
              <p>
                {p.invitedEmail} ·{" "}
                {p.status === "active"
                  ? "Ativo"
                  : p.status === "deleted"
                    ? "Excluído"
                    : "Suspenso"}
              </p>
              {p.status === "deleted" ? (
                <span>/p/{p.slug}</span>
              ) : (
                <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer">
                  /p/{p.slug}
                </a>
              )}
            </div>
            <div>
              {p.status === "deleted" ? (
                <button
                  disabled={restore.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Restaurar ${p.displayName}? A página voltará a ficar disponível. O profissional precisará entrar novamente e reconectar o Google Agenda. As reservas canceladas continuarão canceladas; o WhatsApp ficará oculto até ser ativado novamente.`,
                      )
                    )
                      restore.mutate(p);
                  }}
                >
                  Restaurar cadastro
                </button>
              ) : (
                <>
                  <button
                    disabled={p.status !== "active"}
                    onClick={() => setEditing(p)}
                  >
                    Editar cabeçalho
                  </button>
                  <button
                    disabled={state.isPending}
                    onClick={() =>
                      state.mutate({
                        p,
                        action: p.status === "active" ? "suspended" : "active",
                      })
                    }
                  >
                    {p.status === "active" ? "Suspender" : "Reativar"}
                  </button>
                  <button
                    disabled={state.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir ${p.displayName}? A página será retirada e as reservas ativas serão canceladas.`,
                        )
                      )
                        state.mutate({ p, action: "deleted" });
                    }}
                  >
                    Excluir profissional
                  </button>
                </>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
