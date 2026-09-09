import { requireRole } from "@/lib/session";
import SessaoClient from "./SessaoClient";

export const metadata = {
  title: "Workspace Torg — Conferência de Peça",
  // ⚠ Habilita o modo standalone (sem barra do navegador) quando o operador adiciona esta tela à
  // Tela de Início do celular — é o único jeito de "tela cheia" de verdade no iPhone: o
  // `Fullscreen API` (`requestFullscreen`) não é suportado ali, em nenhum navegador (é limitação
  // do WebKit da Apple, não do Safari especificamente — "Chrome" no iPhone usa o mesmo motor).
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Conferência" },
};

// ⚠ Matheus (09/09/2026): "todos que tiver acesso ao módulo Expedição pode fazer conferência" —
// mesmo perfil das rotas de API (app/api/expedicao/conferencia/**), estreitado do que era antes.
export default async function ConferenciaSessaoPage({ params }) {
  await requireRole(["ADMIN", "EXPEDICAO"]);
  return <SessaoClient id={params.id} />;
}
