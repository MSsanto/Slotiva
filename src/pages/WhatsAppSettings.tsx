import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, type ManagedProfessional } from "../api";

export default function WhatsAppSettings({
  profile,
}: {
  profile: ManagedProfessional;
}) {
  const cache = useQueryClient();
  const [enabled, setEnabled] = useState(profile.whatsappEnabled);
  const save = useMutation({
    mutationFn: (data: unknown) =>
      api<ManagedProfessional>("/admin/whatsapp", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "profile"] });
      void cache.invalidateQueries({ queryKey: ["public-profile"] });
    },
  });
  return (
    <form
      className="hours"
      aria-label="Contato pelo WhatsApp"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        save.mutate({
          whatsappNumber: data.get("whatsappNumber"),
          whatsappEnabled: data.has("whatsappEnabled"),
          version: profile.version,
        });
      }}
    >
      <h3>Contato pelo WhatsApp</h3>
      <label>
        Número do WhatsApp (com código do país)
        <input
          type="tel"
          name="whatsappNumber"
          defaultValue={profile.whatsappNumber ?? ""}
          maxLength={40}
          required={enabled}
          placeholder="+55 12 99999-9999"
          aria-describedby="whatsapp-number-hint"
        />
      </label>
      <p className="hint" id="whatsapp-number-hint">
        Inclua o código do país e o DDD. Ao ativar, esse número ficará público
        na sua página.
      </p>
      <label>
        <input
          type="checkbox"
          name="whatsappEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Mostrar WhatsApp na minha página
      </label>
      <p className="hint">
        A conversa começa com uma mensagem neutra, sem dados do cliente ou da
        reserva. O contato não confirma nem altera agendamentos.
      </p>
      <p role="status">
        {profile.whatsappEnabled
          ? "WhatsApp visível na sua página."
          : "WhatsApp oculto na sua página."}
      </p>
      <button className="primary" disabled={save.isPending}>
        {save.isPending ? "Salvando…" : "Salvar contato"}
      </button>
      {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
    </form>
  );
}
