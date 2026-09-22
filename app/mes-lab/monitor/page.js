// ⚠ `panoramaDaFabrica` recebe o cliente do MES; a programação que ela lê do portal ela
// importa por dentro, explicitamente (ver `lib/mes/monitor.js`).
import { mesPrisma as prisma } from "@/lib/mes/prisma";
import { panoramaDaFabrica } from "@/lib/mes/monitor";
import MonitorClient from "./MonitorClient";

// O MONITOR DE MÁQUINAS (dataset 131, §6.4) — a tela da supervisão, feita para TV.
//
// ⚠ O PRIMEIRO QUADRO VEM DO SERVIDOR, as atualizações vêm do navegador. Quem liga a TV de manhã
// vê a fábrica no primeiro carregamento, sem o piscar de "carregando…" que uma tela só-cliente dá
// — e depois disso quem manda é o relógio do próprio navegador.
export const metadata = {
  title: "Monitor de máquinas (laboratório)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const inicial = await panoramaDaFabrica(prisma);
  return <MonitorClient inicial={inicial} />;
}
