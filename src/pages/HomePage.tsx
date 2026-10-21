import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import BookingPage from "./BookingPage";
export default function HomePage() {
  const config = useQuery({
    queryKey: ["auth-options"],
    queryFn: () => api<{ passwordEnabled: boolean }>("/auth/config"),
  });
  if (config.isPending) return <p role="status">Carregando…</p>;
  if (config.data?.passwordEnabled) return <BookingPage />;
  return (
    <section className="panel">
      <h2>Seu encontro começa com o link certo.</h2>
      <p>
        Acesse o endereço enviado pelo seu profissional para consultar os
        horários e solicitar um agendamento.
      </p>
      <a href="/admin">Acesso do profissional</a>
    </section>
  );
}
