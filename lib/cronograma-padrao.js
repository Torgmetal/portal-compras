import "server-only";
import { prisma } from "./prisma";
import { TEMPLATE_OP89, TEMPLATE_SUPRIMENTOS, DEPT_ORDER, DEPT_LABEL } from "./cronograma-template";

// dias ÚTEIS entre duas datas (o cronograma da Torg roda em DU por padrão)
function diasUteis(a, b) {
  let n = 0;
  const d = new Date(a); d.setHours(12, 0, 0, 0);
  const fim = new Date(b); fim.setHours(12, 0, 0, 0);
  while (d <= fim) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
}

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

  // ENCAIXE NO PRAZO DO COMERCIAL (Vitor 19/08: "você já gera o cronograma e encaixa as datas").
  // O caminho crítico do modelo é ~48 dias úteis; a OP-114 tem 12 de prazo. Quando não cabe, as
  // durações encolhem proporcionalmente (piso de 1 dia). Quando sobra, o modelo fica como está —
  // cronograma que termina antes do prazo é folga, e folga a gente não inventa pra cima.
  const CAMINHO_MODELO = 48;
  let fator = 1;
  if (dataInicio && dataFim) {
    const du = diasUteis(dataInicio, dataFim);
    if (du > 0 && du < CAMINHO_MODELO) fator = du / CAMINHO_MODELO;
  }
  const dur = (d) => Math.max(1, Math.round(d * fator));

  const tarefas = [];
  let uid = 1;
  for (const dept of DEPT_ORDER) {
    if (dept === "SUPRIMENTOS") {
      const linhas = TEMPLATE_SUPRIMENTOS.filter((t) => !t.so || (t.so === "fd" && comFd));
      if (!linhas.length) continue;
      tarefas.push({ uidMpp: uid++, nome: DEPT_LABEL[dept], departamento: dept, isSummary: true, outlineLevel: 1 });
      for (const t of linhas) tarefas.push({ uidMpp: uid++, nome: t.nome, departamento: dept, duracaoDias: dur(t.dur), isSummary: false, outlineLevel: 2 });
      continue;
    }
    const doDept = TEMPLATE_OP89.filter((t) => t.dept === dept);
    if (!doDept.length) continue;
    tarefas.push({ uidMpp: uid++, nome: DEPT_LABEL[dept], departamento: dept, isSummary: true, outlineLevel: 1 });
    for (const t of doDept) tarefas.push({ uidMpp: uid++, nome: t.nome, departamento: dept, duracaoDias: dur(t.dur), isSummary: false, outlineLevel: 2 });
  }

  // ⚠ CONVENÇÃO DA CASA: o cronograma guarda o número com prefixo T ("T115"), não "115" — é o
  // que a tela força ao criar à mão e o que o resto do módulo espera. Eu criei os primeiros
  // automáticos sem o T e a lista do Planejamento ficou fora de ordem (todos os "T" antes de
  // todos os números). (Vitor 19/08.)
  const numeroCrono = /^T/i.test(opNumero) ? String(opNumero).toUpperCase() : `T${opNumero}`;

  const crono = await prisma.cronograma.create({
    data: {
      opNumero: numeroCrono, opId,
      nomeArquivo: "automatico",
      titulo: titulo || `OP-${opNumero}`,
      sharepointPath: `manual://auto/${opNumero}/${Date.now()}`,
      dataInicio: dataInicio || null,
      dataFim: dataFim || null,
      // 🚫 NÃO grava `dataBase` aqui. dataBase é o BASELINE, e existir baseline liga a exigência
      // de justificativa em toda mudança de data (rota PATCH da tarefa). Um cronograma recém-
      // gerado não foi validado por ninguém — nasceu de um modelo. Gravando dataBase no
      // nascimento, o Planejamento tinha de justificar cada ajuste do próprio rascunho.
      // Vitor (19/08/2026): "estou alterando e fica me pedindo para justificar, veja isso".
      // O baseline passa a ser o que sempre deveria ser: um ato deliberado, no botão "Definir".
      areas: [],
      tarefas: { create: tarefas },
    },
    // ⚠ o `nome` é obrigatório aqui: é por ele que o encadeamento reconhece as linhas de
    // Suprimentos. Sem ele o ehSup() dava sempre falso e o cronograma inteiro virava série.
    include: { tarefas: { select: { id: true, nome: true, uidMpp: true, isSummary: true } } },
  });

  // ENCADEAMENTO — não é tudo em série. Dentro de Suprimentos as famílias correm em PARALELO
  // (cotar tinta não espera o aço chegar); só cotação→recebimento da MESMA família é sequencial.
  // Em série puro o caminho dava 85 dias úteis e nenhuma OP curta caberia.
  const seq = crono.tarefas.filter((t) => !t.isSummary).sort((a, b) => a.uidMpp - b.uidMpp);
  const porNome = new Map(seq.map((t) => [t.nome, t]));
  const ehSup = (t) => TEMPLATE_SUPRIMENTOS.some((x) => x.nome === t.nome);
  const antesDeSup = [...seq].filter((t) => !ehSup(t) && t.uidMpp < (seq.find(ehSup)?.uidMpp ?? Infinity)).pop() || null;
  const sup = seq.filter(ehSup);
  const depoisDeSup = seq.filter((t) => !ehSup(t) && t.uidMpp > (sup[sup.length - 1]?.uidMpp ?? -1));

  for (let i = 1; i < seq.length; i++) {
    const t = seq[i];
    let ants;
    if (ehSup(t)) {
      // recebimento espera a cotação da mesma família; cotação espera o fim da Engenharia
      const par = t.nome.replace(/^Recebimento/, "Cotação");
      ants = /^Recebimento/.test(t.nome) && porNome.has(par) ? [porNome.get(par).id] : (antesDeSup ? [antesDeSup.id] : []);
    } else if (depoisDeSup.some((x) => x.id === t.id) && depoisDeSup[0]?.id === t.id) {
      // a 1ª tarefa depois de Suprimentos espera TODOS os recebimentos
      ants = sup.filter((x) => /^Recebimento/.test(x.nome)).map((x) => x.id);
    } else {
      ants = [seq[i - 1].id];
    }
    if (ants.length) await prisma.cronogramaTarefa.update({ where: { id: t.id }, data: { antecessoraIds: ants } });
  }
  return { id: crono.id, tarefas: tarefas.length };
}
