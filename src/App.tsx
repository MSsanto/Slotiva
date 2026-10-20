import { NavLink, Outlet } from "react-router-dom";
import "./App.css";
export default function App() {
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
          <NavLink to="/" end>
            Agendar
          </NavLink>
          <NavLink to="/admin">Minha agenda</NavLink>
        </nav>
        <span className="demo">PORTFÓLIO · MVP</span>
      </header>
      <main id="main">
        <section className="intro">
          <div className="eyebrow">
            <span /> SEU TEMPO, BEM CUIDADO
          </div>
          <h1>
            Um espaço na agenda.
            <br />
            <span>Um passo à frente.</span>
          </h1>
          <p>
            Encontre o melhor momento para sua próxima conversa.
            <br />
            Simples de marcar. Fácil de organizar.
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
