import { useQuery } from "@tanstack/react-query";
import { api, type ProfessionalProfile } from "./api";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import "./App.css";
export default function App() {
  const match = useMatch("/p/:slug");
  const slug = match?.params.slug;
  const profile = useQuery({
    queryKey: ["public-profile", slug ?? "demo"],
    queryFn: () =>
      api<ProfessionalProfile>(`/public/${encodeURIComponent(slug!)}/profile`),
    enabled: !!slug,
    retry: false,
  });
  return (
    <>
      <a className="skip" href="#main">
        Pular para o conteúdo
      </a>
      <header>
        <NavLink className="brand" to="/">
          <span className="brand-icon">s</span>slotiva
          <span className="brand-dot">.</span>
        </NavLink>
        <nav aria-label="Principal">
          <NavLink to={slug ? `/p/${slug}` : "/"} end>
            Agendar
          </NavLink>
          <NavLink to="/admin">Minha agenda</NavLink>
        </nav>
        <span className="demo">PORTFÓLIO · MVP</span>
      </header>
      <main id="main">
        <section
          className={`intro tenant-${(slug && profile.data?.theme) || "forest"}`}
        >
          <div className="eyebrow">
            <span /> SEU TEMPO, BEM CUIDADO
          </div>
          <h1>
            {slug && profile.data ? (
              profile.data.headerTitle
            ) : (
              <>
                Um espaço na agenda.
                <br />
                <span>Um passo à frente.</span>
              </>
            )}
          </h1>
          <p>
            {slug && profile.data ? (
              profile.data.headerSubtitle
            ) : (
              <>
                Encontre o melhor momento para sua próxima conversa.
                <br />
                Simples de marcar. Fácil de organizar.
              </>
            )}
          </p>
        </section>
        <Outlet />
      </main>
      <footer>
        <span>
          slotiva.{" "}
          <span className="footer-muted">
            Agendamento simples, acesso para todos.
          </span>
        </span>
        <span>React + TypeScript · America/Sao_Paulo</span>
      </footer>
    </>
  );
}
