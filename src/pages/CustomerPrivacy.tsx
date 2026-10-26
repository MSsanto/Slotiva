import { useMutation } from "@tanstack/react-query";
import { api, errorMessage, type Booking } from "../api";
import { download } from "../download";
export default function CustomerPrivacy({
  booking,
  headers,
}: {
  booking: Booking;
  headers?: HeadersInit;
}) {
  const request = useMutation({
    mutationFn: () =>
      api(`/bookings/${booking.id}/privacy`, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "delete" }),
      }),
  });
  const exportData = useMutation({
    mutationFn: () => api(`/bookings/${booking.id}/export`, { headers }),
    onSuccess: (data) => download(data, `reserva-${booking.id}.json`),
  });
  return (
    <details>
      <summary>Meus dados</summary>
      <button
        disabled={exportData.isPending}
        onClick={() => exportData.mutate()}
      >
        Exportar dados desta reserva
      </button>
      <button
        disabled={request.isPending}
        onClick={() => {
          if (
            window.confirm(
              "Registrar um pedido de exclusão para análise do profissional? Isso não cancela sua reserva nem apaga o histórico automaticamente.",
            )
          )
            request.mutate();
        }}
      >
        Solicitar exclusão dos meus dados
      </button>
      {request.isSuccess && (
        <p role="status">
          Pedido registrado. O profissional analisará os prazos de guarda e a
          exclusão.
        </p>
      )}
      {(request.isError || exportData.isError) && (
        <p role="alert">{errorMessage(request.error ?? exportData.error)}</p>
      )}
    </details>
  );
}
