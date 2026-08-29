// /engenharia/cronograma — as tarefas de cronograma da ENGENHARIA.
//
// ⚠⚠ MESMO COMPONENTE da aba Cronograma do Planejamento, com o setor travado. Vitor (29/08/2026):
// "preciso criar uma forma com que a engenharia enxergue as tarefas do cronograma, igual temos na
// aba do planejamento (...) porém apenas para as tarefas da engenharia". Cópia da tela divergiria
// na primeira correção feita só de um lado — e é justamente aqui que a Engenharia precisa ver o
// MESMO número que o Planejamento cobra dela e que alimenta o indicador de aderência ao prazo.
import { requireRole } from "@/lib/session";
import AtividadesCronograma from "@/app/planejamento/tarefas/AtividadesCronograma";
import { GanttChart } from "lucide-react";

export const metadata = { title: "Cronograma · Engenharia" };

// ⚠ o middleware já barra quem não tem o módulo; o gate aqui é a segunda tranca, igual às outras
// páginas de /engenharia — e cobre o dia em que a rota mudar de lugar.
export default async function Page() {
  await requireRole(["ADMIN", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO"]);
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-torg-blue/10 rounded-lg">
          <GanttChart size={22} className="text-torg-blue" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Cronograma da Engenharia</h1>
          <p className="text-xs text-torg-gray mt-0.5">
            As atividades da Engenharia nos cronogramas ativos. Concluir aqui atualiza o % do cronograma.
          </p>
        </div>
      </div>
      <AtividadesCronograma deptoFixo="ENGENHARIA" />
    </div>
  );
}
