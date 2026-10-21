import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, type ManagedProfessional } from "../api";
export default function ProfessionalSettings() {
  const cache = useQueryClient();
  const profile = useQuery({
    queryKey: ["admin", "profile"],
    queryFn: () => api<ManagedProfessional>("/admin/profile"),
  });
  const save = useMutation({
    mutationFn: (data: unknown) =>
      api<ManagedProfessional>("/admin/profile", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "profile"] });
      void cache.invalidateQueries({ queryKey: ["public-profile"] });
    },
  });
  if (profile.isPending) return <p role="status">Carregando seu perfil…</p>;
  if (profile.isError) return <p role="alert">{errorMessage(profile.error)}</p>;
  const p = profile.data;
  return (
    <form
      className="hours"
      key={p.version}
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        save.mutate({
          displayName: d.get("displayName"),
          headerTitle: d.get("headerTitle"),
          headerSubtitle: d.get("headerSubtitle"),
          theme: d.get("theme"),
          version: p.version,
        });
      }}
    >
      <h3>Sua página pública</h3>
      <p>
        <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer">
          Abrir /p/{p.slug}
        </a>
      </p>
      <label>
        Nome profissional
        <input
          name="displayName"
          defaultValue={p.displayName}
          maxLength={100}
          required
        />
      </label>
      <label>
        Título do cabeçalho
        <input
          name="headerTitle"
          defaultValue={p.headerTitle}
          maxLength={120}
          required
        />
      </label>
      <label>
        Subtítulo
        <input
          name="headerSubtitle"
          defaultValue={p.headerSubtitle}
          maxLength={240}
        />
      </label>
      <label>
        Tema
        <select name="theme" defaultValue={p.theme}>
          <option value="forest">Verde</option>
          <option value="navy">Azul</option>
          <option value="plum">Ameixa</option>
        </select>
      </label>
      <button className="primary" disabled={save.isPending}>
        Salvar cabeçalho
      </button>
      {save.isSuccess && <p role="status">Cabeçalho atualizado.</p>}
      {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
    </form>
  );
}
