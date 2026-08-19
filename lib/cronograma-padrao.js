import "server-only";
import { prisma } from "./prisma";
import { TEMPLATE_OP89, TEMPLATE_SUPRIMENTOS, DEPT_ORDER, DEPT_LABEL } from "./cronograma-template";

// CRONOGRAMA AUTOMÁTICO NA ABERTURA DA OP.
//
// Vitor (19/08/2026): "abriu a OP, abre cronograma automático… o ideal seria o cálculo exatamente
// de acordo com as datas que vêm indicadas pelo comercial; você já gera o cronograma e encaixa as
// datas, depois podemos revisar para conseguir mais prazo se for o caso".
//
// As datas existem e estão preenchidas: `OP.dataInicio` (41 de 41 OPs) e `OP.dataFimPrevista`
// (37 de 41). É o prazo que o Comercial informa na abertura — dá pra nascer com data de verdade,
// sem inventar nem deixar em branco.
//
// Nasce SEM ÁREAS: o Planejamento é quem sabe em quantas frentes a obra se divide, e as áreas se
// acrescentam depois na tela de Cronogramas. A espinha (Comercial → Engenharia → Suprimentos →
// Fabricação → Expedição) já vem montada e encadeada.
//
// Nunca derruba a criação da OP: se falhar, a OP é criada do mesmo jeito e o cronograma pode ser
// feito à mão. (O que não pode é a OP nascer travada por causa disto.)

/**
 * @returns {Promise<{id:string, tarefas:number}|null>} null se já existia ou se não deu pra criar
 */
export async function criarCronogramaPadrao({ opId, opNumero, titulo, dataInicio, dataFim, comFd = false }) {
  const jaTem = await prisma.cronograma.findFirst({ where: { opId, ativo: true }, select: { id: true } });
  if (jaTem) return null;

  const tarefas = [];
  let uid = 1;
  for (const dept of DEPT_ORDER) {
    if (dept === "SUPRIMENTOS") {
      const linhas = TEMPLATE_SUPRIMENTOS.filter((t) => !t.so || (t.so === "fd" && comFd));
      if (!linhas.length) continue;
      tarefas.push({ uidMpp: uid++, nome: DEPT_LABEL[dept], departamento: dept, isSummary: true, outlineLevel: 1 });
      for (const t of linhas) tarefas.push({ uidMpp: uid++, nome: t.nome, departamento: dept, duracaoDias: t.dur, isSummary: false, outlineLevel: 2 });
      continue;
    }
    const doDept = TEMPLATE_OP89.filter((t) => t.dept === dept);
    if (!doDept.length) continue;
    tarefas.push({ uidMpp: uid++, nome: DEPT_LABEL[dept], departamento: dept, isSummary: true, outlineLevel: 1 });
    for (const t of doDept) tarefas.push({ uidMpp: uid++, nome: t.nome, departamento: dept, duracaoDias: t.dur, isSummary: false, outlineLevel: 2 });
  }

  const crono = await prisma.cronograma.create({
    data: {
      opNumero, opId,
      nomeArquivo: "automatico",
      titulo: titulo || `OP-${opNumero}`,
      sharepointPath: `manual://auto/${opNumero}/${Date.now()}`,
      dataInicio: dataInicio || null,
      dataFim: dataFim || null,
      dataBase: dataInicio || null,
      areas: [],
      tarefas: { create: tarefas },
    },
    include: { tarefas: { select: { id: true, uidMpp: true, isSummary: true } } },
  });

  // Encadeia em série (FS): cada tarefa depende da anterior. Com a data de início da OP, o
  // "Gerar datas" monta o cronograma inteiro sozinho.
  const seq = crono.tarefas.filter((t) => !t.isSummary).sort((a, b) => a.uidMpp - b.uidMpp);
  for (let i = 1; i < seq.length; i++) {
    await prisma.cronogramaTarefa.update({ where: { id: seq[i].id }, data: { antecessoraIds: [seq[i - 1].id] } });
  }
  return { id: crono.id, tarefas: tarefas.length };
}
