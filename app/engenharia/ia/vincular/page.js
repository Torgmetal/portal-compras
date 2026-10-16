import VincularClient from "./VincularClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace Torg — Ligar PC à IA da Engenharia" };

// O projetista digita aqui o código que o app Torg Engenharia mostrou. O acesso do módulo (ENGENHARIA) é conferido
// pelo middleware na página e pela rota /api/engenharia-ia/aparelho/vincular.
export default function VincularPage() {
  return <VincularClient />;
}
