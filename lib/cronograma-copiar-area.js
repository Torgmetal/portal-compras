// ─── COPIAR UMA ÁREA DO CRONOGRAMA PARA OUTRAS ───────────────────────────────
//
// Vitor (09/10/2026), na OP-118: "selecionar a área criada com todas as informações e datas já criadas
// (…) e posteriormente fazer as vinculações. As áreas já foram criadas." Na Fabricação só a área A tinha
// tarefas (Preparação, Montagem, Solda e Pintura, com datas e encadeadas); B, C, D, F e "Romaneio 01"
// estavam cadastradas e vazias. Redigitar as quatro tarefas em cada área é trabalho repetido e convite a
// datas divergentes.
//
// ⚠ O QUE VAI: nome, setor, datas previstas, duração, defasagem, % previsto, responsável e observação —
// a mesma regra do "Copiar para OP" (app/api/planejamento/cronogramas/[id]/duplicar).
// ⚠ O QUE NÃO VAI: o AVANÇO (a área nova não começou: %, datas reais, avanço manual, bloqueio) e a
// QUANTIDADE PLANEJADA, que é da área de origem — a de B se distribui depois ("Importar peso").
// ⚠⚠ O ENCADEAMENTO DENTRO DA ÁREA É REFEITO NAS CÓPIAS: a Montagem de B depende da Preparação de B, não
// da de A. Vínculo com tarefa de FORA da área (os recebimentos de Suprimentos) fica por padrão — quem
// copia pode desligar e refazer as vinculações depois.
// ⚠ DESTINO QUE JÁ TEM TAREFA NO SETOR É RECUSADO: dois cliques no botão não podem dobrar a área.
import { normArea } from "./cronograma-area-cor";

/**
 * @param {{ tarefas: object[], origem: string, departamento: string, destinos: string[],
 *   manterExternas?: boolean, novoId: () => string }} args
 * @returns {{ criar: object[], porDestino: Record<string, number> } | { erro: string }}
 */
export function planoCopiaArea({ tarefas = [], origem, departamento, destinos = [], manterExternas = true, novoId }) {
  const chaveOrigem = normArea(origem);
  const doSetor = (t) => t.departamento === departamento && !t.isSummary;
  const fonte = tarefas.filter((t) => doSetor(t) && normArea(t.area) === chaveOrigem).sort((a, b) => a.uidMpp - b.uidMpp);
  if (!fonte.length) return { erro: `A área ${origem} não tem tarefas neste setor.` };

  const vistos = new Set();
  const alvos = [];
  for (const nome of destinos) {
    const limpo = String(nome || "").trim();
    const k = normArea(limpo);
    if (!limpo || vistos.has(k)) continue;
    vistos.add(k);
    alvos.push(limpo);
  }
  if (!alvos.length) return { erro: "Escolha ao menos uma área de destino." };
  if (alvos.some((a) => normArea(a) === chaveOrigem)) return { erro: "A área de destino não pode ser a mesma área de origem." };
  const ocupadas = alvos.filter((a) => tarefas.some((t) => doSetor(t) && normArea(t.area) === normArea(a)));
  if (ocupadas.length) {
    return { erro: `${ocupadas.map((a) => `A área ${a} já tem tarefas`).join("; ")} neste setor — copie para uma área vazia ou apague as tarefas dela antes.` };
  }

  let uid = tarefas.reduce((m, t) => Math.max(m, Number(t.uidMpp) || 0), 0);
  const criar = [];
  const porDestino = {};
  for (const area of alvos) {
    const novos = new Map(fonte.map((t) => [t.id, novoId()]));
    for (const t of fonte) {
      criar.push({
        id: novos.get(t.id),
        uidMpp: ++uid,
        nome: t.nome,
        departamento: t.departamento,
        area,
        isSummary: false,
        outlineLevel: t.outlineLevel,
        parentUid: t.parentUid ?? null,
        dataInicioPrevista: t.dataInicioPrevista ?? null,
        dataFimPrevista: t.dataFimPrevista ?? null,
        percentualPrevisto: t.percentualPrevisto ?? 0,
        duracaoDias: t.duracaoDias ?? 0,
        defasagemDias: t.defasagemDias ?? 0,
        observacao: t.observacao ?? null,
        responsavelId: t.responsavelId ?? null,
        antecessoraIds: (t.antecessoraIds || []).map((a) => novos.get(a) || (manterExternas ? a : null)).filter(Boolean),
        // a área nova ainda não começou — e a quantidade é da área de origem
        qtdePlanejada: 0,
        qtdeRealizada: 0,
        percentualRealizado: 0,
        avancoManual: false,
        dataInicioReal: null,
        dataFimReal: null,
        dataRealizacao: null,
        dataInicioBase: null,
        dataFimBase: null,
        dataLiberacao: null,
        motivoBloqueio: null,
      });
    }
    porDestino[area] = fonte.length;
  }
  return { criar, porDestino };
}
