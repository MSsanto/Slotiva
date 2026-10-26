import { whatsappContactUrl } from "../api";

export default function WhatsAppContact({
  number,
}: {
  number: string | null | undefined;
}) {
  const href = whatsappContactUrl(number);
  if (!href) return null;
  return (
    <div className="whatsapp-contact">
      <a href={href} target="_blank" rel="noopener noreferrer">
        Falar com o profissional
      </a>
      <small>
        Abre o WhatsApp. Agendamentos e alterações ficam no Slotiva.
      </small>
    </div>
  );
}
