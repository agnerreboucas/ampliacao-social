import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { routeTree } from "../routeTree.gen";
import "../styles.css";

/**
 * Entrada do build estático: monta a mesma árvore de rotas da aplicação, só que
 * inteiramente no navegador.
 *
 * O histórico é em memória porque o HTML gerado pode ser aberto de qualquer
 * lugar (link compartilhado, arquivo local, hospedagem estática) — sem servidor
 * para responder por `/social/contas`, navegar mexendo na URL quebraria a página.
 * Com o histórico em memória a navegação interna funciona normalmente.
 */
const router = createRouter({
  routeTree,
  context: { queryClient: new QueryClient() },
  history: createMemoryHistory({ initialEntries: ["/social"] }),
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado.");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
