import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "./prisma";
import { impactoDasEsperas, diasDeEspera } from "./espera-cronograma";

// ─── POSIÇÃO DO CRONOGRAMA ────────────────────────────────────────────────────
// O documento que se manda ao cliente quando é preciso mostrar, com data e nome, o que foi
// combinado, o que a Torg entregou e o que está parado do lado dele.
//
// Vitor (29/08/2026), sobre a TMSA: "temos que mostrar um histórico para ele do problema que a
// engenharia deles causou — ficaram meses para aprovar um projeto e agora eu preciso comprovar
// para eles, e tenho que buscar informação com uma equipe que não marca nada".
//
// ⚠⚠ NADA AQUI É DIGITADO. Tudo sai de registro que o portal já tem: os envios do cronograma
// (CronogramaEnvio — com data, hora, quem enviou e os nomes do cliente), as tarefas com data real,
// os bloqueios com motivo e a correspondência arquivada. É isso que faz o documento sustentar uma
// discussão: não é a Torg dizendo hoje que o prazo era 14/08 — é o cronograma que o cliente
// recebeu três vezes ANTES do prazo.
//
// ⚠ O QUE ELE NÃO AFIRMA. Não diz "o cliente atrasou" nem atribui culpa: apresenta datas e deixa a
// conclusão para quem lê. Documento que acusa vira discussão sobre o documento.
const NAVY = rgb(0.051, 0.122, 0.235), LARANJA = rgb(0.957, 0.502, 0.122);
const CINZA = rgb(0.34, 0.43, 0.49), ESCURO = rgb(0, 0.16, 0.27);
const VERMELHO = rgb(0.72, 0.15, 0.12), VERDE = rgb(0.11, 0.42, 0.27);

// ⚠ pdf-lib com a fonte padrão só escreve Latin-1: o que passa disso vira erro de encoding no meio
// da geração. Mesma trava do PDF dos planos (ver lib/plano-cliente-pdf).
const san = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[^\x00-\xFF]/g, "");
const dt = (x) => (x ? new Date(x).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const dth = (x) => (x ? new Date(x).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

/** @returns {Promise<{bytes: Uint8Array, nome: string}>} */
export async function gerarPosicaoCronogramaPDF(opId) {
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true, refCliente: true },
  });
  if (!op) throw new Error("OP não encontrada.");

  const crono = await prisma.cronograma.findFirst({
    where: { opId: op.id, ativo: true },
    select: { id: true, titulo: true },
  });
  if (!crono) throw new Error("Esta OP não tem cronograma ativo.");

  // ⚠⚠ TUDO, NÃO UMA AMOSTRA. Vitor (29/08/2026): "o resumo precisa ser muito mais detalhado, bem
  // mais mesmo, uma coisa que realmente mostre as coisas". Documento de cobrança que resume perde
  // exatamente a linha que a outra parte vai contestar — aqui vai a correspondência inteira, a
  // lista completa de tarefas e cada envio, em ordem, com data.
  const [envios, tarefas, correspondencia, revisoes] = await Promise.all([
    prisma.cronogramaEnvio.findMany({
      where: { cronogramaId: crono.id }, orderBy: { createdAt: "asc" },
      select: { createdAt: true, destinatarios: true, enviados: true, assunto: true, createdBy: { select: { name: true } } },
    }),
    prisma.cronogramaTarefa.findMany({
      where: { cronogramaId: crono.id, isSummary: false },
      select: { nome: true, departamento: true, dataInicioPrevista: true, dataFimPrevista: true, dataFimReal: true,
                percentualRealizado: true, motivoBloqueio: true, dataLiberacao: true, esperaInicio: true },
      orderBy: { dataFimPrevista: "asc" },
    }),
    prisma.obraEmailEvento.findMany({
      where: { opId: op.id }, orderBy: [{ recebidoEm: "asc" }, { enviadoEm: "asc" }],
      select: { direcao: true, de: true, deNome: true, assunto: true, recebidoEm: true, enviadoEm: true,
                tipoGatilho: true, temAnexo: true, anexos: true },
    }),
    prisma.cronogramaRevisao.findMany({
      where: { cronogramaId: crono.id }, orderBy: { createdAt: "asc" },
      select: { createdAt: true, descricao: true },
    }).catch(() => []),
  ]);
  const emails = correspondencia.length;
  const janela = {
    _min: { recebidoEm: correspondencia[0]?.recebidoEm || correspondencia[0]?.enviadoEm || null },
    _max: { recebidoEm: correspondencia.at(-1)?.recebidoEm || correspondencia.at(-1)?.enviadoEm || null },
  };
  const daEng = tarefas.filter((t) => t.departamento === "ENGENHARIA");
  const imp = (await impactoDasEsperas("ENGENHARIA")).find((i) => i.opId === op.id) || null;

  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica), b = await pdf.embedFont(StandardFonts.HelveticaBold);
  let pg = pdf.addPage([595, 842]);
  const W = 595;
  let y = 842;

  pg.drawRectangle({ x: 0, y: y - 70, width: W, height: 70, color: NAVY });
  pg.drawRectangle({ x: 0, y: y - 74, width: W, height: 4, color: LARANJA });
  pg.drawText("POSICAO DO CRONOGRAMA", { x: 40, y: y - 32, size: 16, font: b, color: rgb(1, 1, 1) });
  pg.drawText(san(`OP-${op.numero} · ${op.cliente || ""}${op.obra ? " · " + op.obra : ""}`),
    { x: 40, y: y - 50, size: 9.5, font: f, color: rgb(0.72, 0.78, 0.86) });
  pg.drawText(`Emitido em ${dt(new Date())}`, { x: W - 155, y: y - 32, size: 9, font: f, color: rgb(0.72, 0.78, 0.86) });
  y -= 98;

  // ⚠ quebra de página simples: o documento cresce com o nº de tarefas paradas, e obra com muitas
  // esperas passava da folha em silêncio.
  const espaco = (n) => { if (y - n < 70) { pg = pdf.addPage([595, 842]); y = 800; } };
  const sec = (t) => { espaco(40); pg.drawText(t, { x: 40, y, size: 9, font: b, color: LARANJA });
    pg.drawLine({ start: { x: 40, y: y - 4 }, end: { x: W - 40, y: y - 4 }, thickness: 0.6, color: LARANJA }); y -= 18; };
  const txt = (t, x = 40, sz = 9, fo = f, co = ESCURO) => pg.drawText(san(t), { x, y, size: sz, font: fo, color: co });

  // ── o quadro que responde tudo antes de virar a página ──
  const emEspera = daEng.filter((t) => t.motivoBloqueio && !t.dataLiberacao && !t.dataFimReal);
  const diasEspera = emEspera.reduce((a, t) => a + diasDeEspera(t).dias, 0);
  const maiorEspera = emEspera.reduce((a, t) => Math.max(a, diasDeEspera(t).dias), 0);
  const noPrazo = daEng.filter((t) => t.dataFimReal && t.dataFimPrevista && t.dataFimReal <= t.dataFimPrevista).length;
  const concluidas = daEng.filter((t) => t.dataFimReal).length;

  espaco(70);
  pg.drawRectangle({ x: 40, y: y - 54, width: W - 80, height: 54, color: rgb(0.96, 0.97, 0.98) });
  const kpi = (rot, val, x, cor = ESCURO) => {
    pg.drawText(san(rot), { x, y: y - 16, size: 6.8, font: b, color: CINZA });
    pg.drawText(san(String(val)), { x, y: y - 38, size: 15, font: b, color: cor });
  };
  kpi("ENVIOS AO CLIENTE", envios.length, 52);
  kpi("TAREFAS DA ENGENHARIA", `${concluidas}/${daEng.length}`, 152);
  kpi("ENTREGUES NO PRAZO", concluidas ? `${noPrazo}/${concluidas}` : "—", 272, VERDE);
  kpi("PARADAS AGUARDANDO", emEspera.length, 392, VERMELHO);
  kpi("MAIOR ESPERA", `${maiorEspera} dias`, 482, VERMELHO);
  y -= 54;
  const nRespCli = correspondencia.filter((e) => e.direcao === "ENTRADA" && e.de && !/@torg\.com\.br\s*$/i.test(e.de)).length;
  txt(`Somadas, as tarefas paradas acumulam ${diasEspera} dias de espera. ${nRespCli} respostas do cliente no periodo ${dt(janela._min.recebidoEm)} a ${dt(new Date())}.`,
    40, 8, f, CINZA);
  y -= 24;

  sec("1. O CRONOGRAMA FOI ENVIADO AO CLIENTE");
  if (!envios.length) { txt("Nenhum envio registrado no portal.", 40, 9, f, CINZA); y -= 16; }
  for (const e of envios) {
    espaco(30);
    const cli = (e.destinatarios || []).filter((x) => x.tipo === "CLIENTE");
    txt(dth(e.createdAt), 40, 9, b);
    txt(`${e.enviados} e-mails enviados por ${e.createdBy?.name || "—"}`, 160, 9);
    y -= 12;
    txt(cli.map((c) => c.nome || c.email).join(" · ").slice(0, 108), 50, 8, f, CINZA);
    y -= 15;
  }
  y -= 6;

  sec("2. O QUE A TORG ENTREGOU");
  const feitas = daEng.filter((t) => t.dataFimReal || (t.percentualRealizado || 0) >= 100);
  txt(`${feitas.length} de ${daEng.length} tarefas de engenharia concluidas`, 40, 9, b, VERDE); y -= 14;
  for (const t of feitas) {
    espaco(16);
    txt(`- ${String(t.nome).slice(0, 62)}`, 50, 8.5);
    txt(t.dataFimReal ? dt(t.dataFimReal) : "concluida", 400, 8.5, f, CINZA);
    y -= 12;
  }
  y -= 8;

  sec("3. O QUE ESTA PARADO AGUARDANDO O CLIENTE");
  const paradas = daEng.filter((t) => t.motivoBloqueio && !t.dataLiberacao && !t.dataFimReal);
  if (!paradas.length) { txt("Nenhuma tarefa aguardando o cliente.", 40, 9, f, CINZA); y -= 16; }
  for (const t of paradas) {
    espaco(28);
    const { dias } = diasDeEspera(t);
    txt(`- ${String(t.nome).slice(0, 44)}`, 50, 8.5, b);
    txt(`prazo ${dt(t.dataFimPrevista)}`, 300, 8.5, f, CINZA);
    txt(`parado ha ${dias} dias`, 400, 8.5, b, VERMELHO);
    y -= 12;
    txt(String(t.motivoBloqueio).slice(0, 92), 58, 7.5, f, CINZA);
    y -= 13;
  }
  y -= 8;

  if (imp && imp.diasNaEntrega > 0) {
    sec("4. O EFEITO NA ENTREGA");
    espaco(50);
    pg.drawRectangle({ x: 40, y: y - 40, width: W - 80, height: 40, color: rgb(0.99, 0.96, 0.90) });
    txt("ENTREGA PREVISTA", 50, 7.5, b, CINZA); y -= 18;
    txt(dt(imp.fimAtual), 50, 13, b); txt("->", 120, 13, b, CINZA); txt(dt(imp.fimNovo), 143, 13, b, VERMELHO);
    txt(`+${imp.diasNaEntrega} dias`, 215, 10, b, VERMELHO);
    txt(`${imp.tarefasMovidas} tarefas deslocadas em ${imp.porSetor.length} setores`, 330, 9, f, CINZA);
    y -= 34;
  }

  if (emails) {
    sec("5. REGISTRO DA COMUNICACAO");
    txt(`${emails} e-mails trocados com o cliente, de ${dt(janela._min.recebidoEm)} a ${dt(janela._max.recebidoEm)},`, 40, 9);
    y -= 12;
    txt("arquivados no portal com remetente, data, assunto e anexos.", 40, 9);
    y -= 16;
  }

  // ─── 6. LINHA DO TEMPO ──────────────────────────────────────────────────────
  // ⚠⚠ TUDO NA MESMA ORDEM CRONOLÓGICA. É o que transforma listas separadas em narrativa: dá para
  // ler "o cronograma foi enviado dia 30/07, o prazo era 14/08, e a resposta do cliente veio em X".
  // Separadas por tipo, essas três informações nunca se encontram na cabeça de quem lê.
  const linha = [];
  for (const e of envios) linha.push({ em: e.createdAt, tipo: "CRONOGRAMA ENVIADO",
    txt: `para ${(e.destinatarios || []).filter((x) => x.tipo === "CLIENTE").length} contato(s) do cliente · ${e.enviados} e-mails`, cor: NAVY });
  for (const t of daEng) {
    if (t.dataFimReal) linha.push({ em: t.dataFimReal, tipo: "ENTREGUE",
      txt: `${t.nome}${t.dataFimPrevista ? ` (prazo ${dt(t.dataFimPrevista)})` : ""}`,
      cor: t.dataFimPrevista && t.dataFimReal > t.dataFimPrevista ? VERMELHO : VERDE });
    if (t.esperaInicio) linha.push({ em: t.esperaInicio, tipo: "ENTROU EM ESPERA", txt: `${t.nome} — ${t.motivoBloqueio || ""}`, cor: VERMELHO });
    if (t.dataLiberacao) linha.push({ em: t.dataLiberacao, tipo: "LIBERADA", txt: t.nome, cor: VERDE });
  }
  for (const e of correspondencia) linha.push({ em: e.recebidoEm || e.enviadoEm,
    tipo: e.direcao === "SAIDA" ? "E-MAIL ENVIADO" : "E-MAIL RECEBIDO",
    txt: `${String(e.assunto || "(sem assunto)").slice(0, 62)}${e.tipoGatilho && e.tipoGatilho !== "OUTRO" ? ` [${e.tipoGatilho}]` : ""}`,
    cor: e.direcao === "SAIDA" ? ESCURO : CINZA });
  linha.sort((a, x) => new Date(a.em || 0) - new Date(x.em || 0));

  sec("6. LINHA DO TEMPO");
  for (const l of linha) {
    espaco(14);
    txt(dt(l.em), 42, 7.5, f, CINZA);
    txt(l.tipo, 92, 7.5, b, l.cor);
    txt(String(l.txt).slice(0, 74), 200, 7.5, f, ESCURO);
    y -= 11;
  }
  y -= 10;

  // ─── 7. TODAS AS TAREFAS ────────────────────────────────────────────────────
  sec("7. TAREFAS DO CRONOGRAMA, UMA A UMA");
  espaco(18);
  pg.drawRectangle({ x: 40, y: y - 13, width: W - 80, height: 13, color: NAVY });
  txt("SETOR", 44, 7, b, rgb(1, 1, 1)); txt("TAREFA", 108, 7, b, rgb(1, 1, 1));
  txt("PRAZO", 340, 7, b, rgb(1, 1, 1)); txt("ENTREGUE", 392, 7, b, rgb(1, 1, 1)); txt("SITUACAO", 452, 7, b, rgb(1, 1, 1));
  y -= 13;
  for (const t of tarefas) {
    espaco(13);
    const atrasou = t.dataFimReal && t.dataFimPrevista && t.dataFimReal > t.dataFimPrevista;
    const parada = t.motivoBloqueio && !t.dataLiberacao && !t.dataFimReal;
    txt(String(t.departamento || "—").slice(0, 11), 44, 7, f, CINZA);
    txt(String(t.nome).slice(0, 46), 108, 7.5);
    txt(dt(t.dataFimPrevista), 340, 7);
    txt(t.dataFimReal ? dt(t.dataFimReal) : "—", 392, 7, f, atrasou ? VERMELHO : ESCURO);
    txt(parada ? `parada ha ${diasDeEspera(t).dias}d` : t.dataFimReal ? (atrasou ? "com atraso" : "no prazo") : "em aberto",
      452, 7, b, parada || atrasou ? VERMELHO : t.dataFimReal ? VERDE : CINZA);
    y -= 11;
  }
  y -= 10;

  // ─── 8. A CORRESPONDÊNCIA, ITEM A ITEM ──────────────────────────────────────
  if (correspondencia.length) {
    sec("8. CORRESPONDENCIA COM O CLIENTE");
    for (const e of correspondencia) {
      espaco(22);
      txt(dt(e.recebidoEm || e.enviadoEm), 42, 7.5, b);
      txt(e.direcao === "SAIDA" ? "TORG ->" : "-> TORG", 92, 7.5, b, e.direcao === "SAIDA" ? NAVY : CINZA);
      txt(String(e.deNome || e.de || "—").slice(0, 26), 140, 7.5, f, CINZA);
      txt(String(e.assunto || "(sem assunto)").slice(0, 46), 260, 7.5);
      if (e.tipoGatilho && e.tipoGatilho !== "OUTRO") txt(e.tipoGatilho, 470, 7, b, LARANJA);
      y -= 10;
      const anx = (e.anexos || []).map((a) => a.nome).filter(Boolean);
      if (anx.length) { txt(`anexos: ${anx.join(", ").slice(0, 90)}`, 140, 6.8, f, CINZA); y -= 9; }
      y -= 2;
    }
    y -= 8;
  }

  // ─── 8b. AS RESPOSTAS DO CLIENTE, COM O QUE ELE ESCREVEU ────────────────────
  // ⚠⚠ AQUI ESTÁ A PROVA, E ELA CORTA DOS DOIS LADOS. Vitor (29/08/2026): "consegue trazer os
  // e-mails que os clientes responderam?". A resposta do cliente é o único trecho do dossiê em que
  // a outra parte fala — e é por isso que ela entra com TEXTO, não só com assunto.
  //
  // ⚠ E é por isso também que este documento não acusa: na OP-089 o cliente pede revisão de
  // cronograma por fornecimento acrescentado (mudança de escopo, a favor da Torg) mas TAMBÉM cobra
  // desenho de montagem e prazo (contra). Mandar um dossiê sem ler isto é entregar o contra-
  // argumento junto. Quem lê decide o que fazer; o documento mostra.
  const respostasCliente = correspondencia.filter(
    (e) => e.direcao === "ENTRADA" && e.de && !/@torg\.com\.br\s*$/i.test(e.de),
  );
  if (respostasCliente.length) {
    sec("8b. O QUE O CLIENTE RESPONDEU");
    txt(`${respostasCliente.length} mensagens vindas do cliente, na integra do trecho arquivado:`, 40, 8, f, CINZA);
    y -= 16;
    for (const e of respostasCliente) {
      espaco(46);
      txt(dt(e.recebidoEm || e.enviadoEm), 42, 8, b);
      txt(String(e.deNome || e.de).slice(0, 40), 100, 8, b, ESCURO);
      txt(String(e.de).slice(0, 34), 250, 7, f, CINZA);
      if (e.tipoGatilho && e.tipoGatilho !== "OUTRO") txt(e.tipoGatilho, 470, 7, b, LARANJA);
      y -= 11;
      txt(String(e.assunto || "(sem assunto)").slice(0, 96), 50, 7.5, f, CINZA);
      y -= 11;
      // o texto quebrado em linhas de ~104 caracteres
      const corpo = String(e.snippet || "").replace(/\s+/g, " ").trim();
      for (const linhaTxt of (corpo.match(/.{1,104}(\s|$)/g) || []).slice(0, 4)) {
        espaco(12);
        txt(linhaTxt.trim(), 50, 7.5, f, ESCURO);
        y -= 10;
      }
      const anx = (e.anexos || []).map((a) => a.nome).filter(Boolean);
      if (anx.length) { espaco(12); txt(`anexos: ${anx.join(", ").slice(0, 92)}`, 50, 6.8, f, CINZA); y -= 10; }
      y -= 6;
    }
    y -= 6;
  }

  // ─── 9. REVISÕES DO CRONOGRAMA ──────────────────────────────────────────────
  if (revisoes.length) {
    sec("9. REVISOES DO CRONOGRAMA");
    for (const r of revisoes) {
      espaco(12);
      txt(dt(r.createdAt), 42, 7.5, f, CINZA);
      txt(String(r.descricao || "").slice(0, 92), 100, 7.5);
      y -= 11;
    }
  }

  const ultima = pdf.getPages()[pdf.getPageCount() - 1];
  ultima.drawText("Documento gerado pelo Portal Torg a partir do registro do cronograma, dos envios ao cliente e da",
    { x: 40, y: 58, size: 7.5, font: f, color: CINZA });
  ultima.drawText("correspondencia arquivada. Os dias de espera contam do prazo acordado ate a data de emissao.",
    { x: 40, y: 48, size: 7.5, font: f, color: CINZA });
  ultima.drawText("TORG METAL", { x: W - 95, y: 48, size: 8, font: b, color: NAVY });

  return { bytes: await pdf.save(), nome: `Posicao-Cronograma-OP-${op.numero}.pdf` };
}
