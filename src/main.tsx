import { AdminPage, MasterPage } from "./pages/LazyPanels";
import HomePage from "./pages/HomePage";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";
import "./index.css";
import App from "./App";
import PublicBookingPage from "./pages/PublicBookingPage";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 0 },
    mutations: { retry: false },
  },
});
const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/p/:slug", element: <PublicBookingPage /> },
      {
        path: "/master",
        element: (
          <Suspense fallback={<p role="status">Carregando painel…</p>}>
            <MasterPage />
          </Suspense>
        ),
      },
      {
        path: "/admin",
        element: (
          <Suspense fallback={<p role="status">Carregando agenda…</p>}>
            <AdminPage />
          </Suspense>
        ),
      },
      {
        path: "*",
        element: (
          <section className="panel">
            <h2>Página não encontrada</h2>
            <Link to="/">Voltar ao agendamento</Link>
          </section>
        ),
      },
    ],
  },
]);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
