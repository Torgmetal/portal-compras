import { pecaEhCroqui } from "./prioridades-setor";
import "server-only";
import { prisma } from "./prisma";
import { expandirPeca } from "./gantt-distribuicao";
import { CAMPO, lotesProgramados } from "./gantt-pcp";
import { lerProduzidoPorSetor } from "./produzido-setor";
import { OP_VIVA } from "./op-viva";
import { SO_FABRICACAO } from "./lista-pecas";

/* A LISTA DE UM POSTO — o que está na mão daquele montador (ou daquela máquina/galpão).
 *
 * ⚠⚠ Vitor (08/09/2026): "na frente do nome do montador teria como colocar uma opção para imprimir
 * uma lista completa do que está no nome do montador? Poderia ter uma maneira de ser por dia ou
 * semana, e sair a planilha que já usamos de modelo".
 *
 * ⚠ VALE PARA QUALQUER POSTO, não só a montagem: o laser, o jato e o galpão de pintura têm a mesma
 * pergunta e o mesmo dado. Um caso especial da montagem seria código a mais para fazer menos.
 *
 * ⚠ O SALDO É O QUE IMPORTA. Quem recebe a lista quer saber o que FALTA, não o que já saiu — por
 * isso vem `feito` e `saldo` por marca, e o total só conta o saldo.
 */

/** Dia (UTC, 00:00) a partir de "YYYY-MM-DD". */
const diaUTC = (s) => new Date(`${s}T00:00:00.000Z`);

/**
 * @param {string} setor  chave do portal (CORTE, MONTAGEM, …)
 * @param {string} recurso  a bancada/máquina/galpão (a CHAVE gravada na peça, ex. "MONTAGEM 1")
 * @param {string} de   "YYYY-MM-DD"
 * @param {string} ate  "YYYY-MM-DD" (inclusive)
 */
export async function listaDoPosto(setor, recurso, de, ate) {
  const campo = CAMPO[setor];
  if (!campo) throw new Error(`Setor desconhecido: ${setor}`);
  if (!de || !ate) throw new Error("Informe o período.");

  const fim = diaUTC(ate); fim.setUTCDate(fim.getUTCDate() + 1); // exclusivo
  const distribuicoes = await prisma.ganttDistribuicao.findMany({where:{setor}}) || [];
  const porId = new Map(distribuicoes.map(d=>[d.pecaId,d]));
  const pecas = await prisma.pecaConjunto.findMany({
    where: {
      ...SO_FABRICACAO,
      AND: [OP_VIVA, {OR: [{[campo.recurso]: recurso || null, [campo.dia]: { gte: diaUTC(de), lt: fim }}, {id:{in:[...porId.keys()]}}]}],
    },
    select: {
      id: true, opId: true, marca: true, descricao: true, perfil: true, qte: true,
      pesoTotalKg: true, tipoPeca: true, _count: {select: {croquiConjuntos:true}}, [campo.dia]: true, [campo.recurso]: true,
      op: { select: { numero: true, obra: true } },
    },
    orderBy: [{ [campo.dia]: "asc" }, { marca: "asc" }],
  });
  const feito = await lerProduzidoPorSetor(pecas.map((p) => ({ opId: p.opId, marca: p.marca })), [setor]);

  const efetivas = pecas.filter(p=>setor === "CORTE" || !pecaEhCroqui(p)).flatMap(p => expandirPeca(p,campo,porId.get(p.id),feito(p,setor)))
    .filter(p => p[campo.dia] && p[campo.dia] >= de && p[campo.dia] <= ate && (p[campo.recurso] || null) === (recurso || null));
  const linhas = efetivas.map((p) => {
    const qte = Math.max(1, p.qte || 1);
    const f = p.feitoDistribuido;
    return {
      dia: p[campo.dia] ? new Date(p[campo.dia]).toISOString().slice(0, 10) : null,
      opNumero: p.op?.numero || null, obra: p.op?.obra || null,
      marca: p.marca, descricao: p.descricao || null, perfil: p.perfil || null,
      tipo: p.tipoPeca || null, qte, feito: f, saldo: qte - f,
      // ⚠ o peso segue o SALDO: o que já saiu não é carga de quem vai receber a lista
      kg: ((p.pesoTotalKg || 0) / qte) * (qte - f),
    };
  });
  const abertos = linhas.filter((l) => l.saldo > 0);
  return {
    setor, recurso: recurso || null, de, ate,
    linhas,
    total: {
      marcas: new Set(linhas.map(l=>`${l.opNumero}|${l.marca}`)).size, marcasAbertas: new Set(abertos.map(l=>`${l.opNumero}|${l.marca}`)).size,
      pecas: abertos.reduce((s, l) => s + l.saldo, 0),
      kg: abertos.reduce((s, l) => s + l.kg, 0),
      ops: [...new Set(abertos.map((l) => l.opNumero).filter(Boolean))].sort(),
      dias: [...new Set(abertos.map((l) => l.dia).filter(Boolean))].sort(),
    },
  };
}

/** Lista completa da raia sem recurso, com os mesmos filtros e frações do Gantt. */
export async function listaSemBancada(setor) {
  if (!CAMPO[setor] && setor !== 'EXPEDICAO') throw new Error('Setor inválido.');
  const lotes = (await lotesProgramados()).filter(l => l.setor === setor && !l.recurso);
  const linhas = lotes.flatMap(l => l.itens.map(i => ({
    dia:l.dia, opNumero:l.op, obra:l.obra, marca:i.m, perfil:i.pf || null,
    descricao:i.mt || null, qte:i.q, feito:i.f || 0, saldo:Math.max(0,i.q-(i.f||0)),
    kg:i.q ? i.kg * Math.max(0,i.q-(i.f||0)) / i.q : 0,
  }))).sort((a,b)=>String(a.opNumero).localeCompare(String(b.opNumero)) || a.marca.localeCompare(b.marca) || a.dia.localeCompare(b.dia));
  const abertos=linhas.filter(l=>l.saldo>0);
  return {setor,recurso:null,linhas,total:{
    marcas:new Set(linhas.map(l=>`${l.opNumero}|${l.marca}`)).size,
    marcasAbertas:new Set(abertos.map(l=>`${l.opNumero}|${l.marca}`)).size,
    pecas:abertos.reduce((s,l)=>s+l.saldo,0),kg:abertos.reduce((s,l)=>s+l.kg,0),
    ops:[...new Set(abertos.map(l=>l.opNumero))].sort(),dias:[...new Set(linhas.map(l=>l.dia))].sort(),
  }};
}
