import { useMutation, useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../api";
export default function CustomerRecovery({ slug }: { slug: string }) {
  const status = useQuery({
    queryKey: ["customer-delivery"],
    queryFn: () => api<{ enabled: boolean }>("/customer/delivery"),
    retry: false,
  });
  const recovery = useMutation({
    mutationFn: (data: { bookingId: string; email: string }) =>
      api<{ detail: string }>("/customer/recovery", {
        method: "POST",
        body: JSON.stringify({ ...data, slug }),
      }),
  });
  if (!status.data?.enabled) return null;
  return (
    <details className="hours">
      <summary>Recuperar acesso a uma reserva</summary>
      <p>
        Informe o código da reserva e o e-mail usado no agendamento. O acesso
        será enviado somente para esse endereço. Cada link vale por 30 minutos e
        pode ser usado uma vez.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          recovery.mutate({
            bookingId: String(data.get("bookingId")).trim(),
            email: String(data.get("email")).trim(),
          });
        }}
      >
        <label>
          Código da reserva
          <input name="bookingId" required maxLength={36} autoComplete="off" />
        </label>
        <label>
          E-mail da reserva
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button disabled={recovery.isPending}>Enviar link de acesso</button>
      </form>
      {recovery.data && <p role="status">{recovery.data.detail}</p>}
      {recovery.isError && <p role="alert">{errorMessage(recovery.error)}</p>}
    </details>
  );
}
