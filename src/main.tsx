import MasterPage from "./pages/MasterPage";
import HomePage from "./pages/HomePage";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";
import "./index.css";
import App from "./App";
import PublicBookingPage from "./pages/PublicBookingPage";
import AdminPage from "./pages/AdminPage";
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
      { path: "/master", element: <MasterPage /> },
      { path: "/admin", element: <AdminPage /> },
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
