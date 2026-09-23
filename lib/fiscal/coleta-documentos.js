import "server-only";
import { prisma } from "@/lib/prisma";
import { consultarNFePorPedido } from "@/lib/omie-nfe";

// ─── DE ONDE VÊM OS DOCUMENTOS DE UMA OBRA ───────────────────────────────────
//
// Duas fontes com VÍNCULO VERIFICÁVEL à OP, e só elas:
//   1. as MEDIÇÕES (OPMedicao → codigoPedidoOmie → ConsultarNF no Omie);
//   2. os ROMANEIOS de terceiro (RomaneioTerceiro → remessa fiscal já emitida).
//
// ⚠⚠ NÃO EXISTE BUSCA POR CNPJ + PERÍODO AQUI, DE PROPÓSITO. Ela acharia mais documentos, e
// acharia errado: duas obras do mesmo cliente no mesmo mês se misturam, e o vínculo passaria a ser
// heurística apresentada como fato. O Codex foi explícito — busca por participante e janela de
// data nunca promove um documento a "encontrado"; no máximo sugere um candidato para alguém
// conferir. Enquanto não houver essa confirmação humana, ela fica de fora.
//
// ⚠⚠ E A COBERTURA VIAJA JUNTO DOS DOCUMENTOS. Sem ela, "não localizei" viraria "não existe" —
// quando o que aconteceu pode ter sido o Omie fora do ar, a cota estourada, ou a nota ter saído
// por um caminho que não passa por medição nem romaneio.

// ⚠⚠⚠ O OMIE BLOQUEIA A CONTA POR MEIA HORA, E EU PROVEI ISSO DO JEITO CARO (23/09/2026). Vinte e
// cinco `ConsultarNF` seguidas, para medir quantas obras tinham nota, derrubaram a API inteira:
// `{"faultcode":"MISUSE_API_PROCESS","faultstring":"API bloqueada por consumo indevido. Tente
// novamente em 1764 segundos."}` — e isso não atinge só esta tela, atinge todo cron e toda tela do
// portal que fala com o Omie. O teto e a pausa aqui não são educação: são a diferença entre uma
// conferência e meia hora de portal cego.
const MAX_CONSULTAS = 12;
const PAUSA_MS = 600;
// ⚠⚠ E A MEDIÇÃO QUE O PRÓPRIO OMIE JÁ DIZ NÃO FATURADA NÃO É CONSULTADA. Medido: das 25 medições
// mais recentes, 25 estão em "Não Faturado", etapa 10 — vinte e cinco chamadas para descobrir o
// que a coluna já dizia. ⚠ O status pode estar velho, então isso ENCOLHE a cobertura e é DITO em
// `fontes`; nunca vira "esta obra não tem nota".
const NAO_FATURADO = /n[ãa]o\s*faturad/i;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const dataBR = (s) => {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`) : null;
};

async function dasMedicoes(opId, documentos, cobertura) {
  const medicoes = await prisma.oPMedicao.findMany({
    where: { opId, codigoPedidoOmie: { not: null } },
    select: { id: true, numeroPedidoOmie: true, codigoPedidoOmie: true, descricao: true, tipoDocumento: true, status: true },
    orderBy: { numeroPedidoOmie: "asc" },
  });
  if (!medicoes.length) return;

  const candidatas = medicoes.filter((m) => !NAO_FATURADO.test(String(m.status ?? "")));
  const puladas = medicoes.length - candidatas.length;
  if (puladas) cobertura.fontes.push(`${puladas} medição(ões) marcadas “não faturado” no Omie não foram consultadas`);

  const lote = candidatas.slice(0, MAX_CONSULTAS);
  if (candidatas.length > lote.length) {
    cobertura.falhas.push(`a OP tem ${candidatas.length} medições faturáveis e só as ${lote.length} primeiras foram consultadas`);
  }
  if (!lote.length) return;
  let consultadas = 0;

  for (const m of lote) {
    if (consultadas++) await dormir(PAUSA_MS);
    const r = await consultarNFePorPedido(m.codigoPedidoOmie);
    // ⚠⚠ ERRO NÃO É AUSÊNCIA — ele entra em `falhas` e encolhe a cobertura, nunca some.
    if (r?.error) { cobertura.falhas.push(`pedido ${m.numeroPedidoOmie}: ${r.error}`); continue; }
    if (!r?.nf) continue; // pedido legitimamente ainda não faturado
    if (!r.nf.cfops) {
      cobertura.falhas.push(`NF ${r.nf.numero ?? "?"} do pedido ${m.numeroPedidoOmie}: não foi possível ler o CFOP dos itens`);
    }
    documentos.push({
      id: `medicao:${m.id}`,
      origem: "MEDICAO",
      cfops: r.nf.cfops ?? [],
      numero: r.nf.numero, serie: r.nf.serie, chave: r.nf.chave,
      emitidaEm: dataBR(r.nf.dataEmissao), natureza: r.nf.natureza, situacao: r.nf.situacao,
      vinculo: `medição ${m.numeroPedidoOmie}${m.descricao ? ` — ${m.descricao}` : ""}`,
      dataDeQue: "emissão informada pelo Omie",
    });
  }
  cobertura.fontes.push(`${lote.length} medição(ões) da OP consultadas no Omie`);
}

async function dosRomaneios(opId, opNumero, documentos, cobertura) {
  const onde = [{ opRefId: opId }];
  if (opNumero) onde.push({ opRefNumero: opNumero });
  const romaneios = await prisma.romaneioTerceiro.findMany({
    where: { OR: onde },
    select: {
      numero: true, terceiroNome: true, servico: true, remessaStatus: true, remessaCfop: true,
      remessaNfNumero: true, remessaNfSerie: true, remessaNfChave: true, remessaNfEmitidaEm: true,
    },
    orderBy: { numero: "asc" },
  });

  for (const r of romaneios) {
    if (r.remessaStatus === "PENDENTE" || r.remessaStatus === "DISPENSADA") continue;
    const cfop = String(r.remessaCfop ?? "").replace(/\D/g, "");
    if (cfop.length !== 4) {
      cobertura.falhas.push(`romaneio RT-${r.numero}: remessa ${r.remessaStatus} sem CFOP gravado`);
      continue;
    }
    documentos.push({
      id: `romaneio:${r.numero}`,
      origem: "ROMANEIO",
      cfops: [cfop],
      numero: r.remessaNfNumero, serie: r.remessaNfSerie, chave: r.remessaNfChave,
      emitidaEm: r.remessaNfEmitidaEm,
      situacao: r.remessaStatus === "CANCELADA" ? "CANCELADA" : "EMITIDA",
      vinculo: `romaneio RT-${r.numero} — ${r.terceiroNome}${r.servico ? ` (${r.servico})` : ""}`,
      // ⚠⚠ ESTA DATA É REGISTRO LOCAL, NÃO DATA FISCAL (achado do Codex, 23/09/2026). Ela é
      // gravada com `new Date()` quando alguém muda o status na tela da Remessa Terceiro — pode
      // ser dias depois da emissão, e a rota ainda aceita o número da NF digitado à mão. Dizer
      // "emitida em" seria emprestar fé de documento a um carimbo de tela.
      dataDeQue: "registro no portal (não é a data fiscal de emissão)",
    });
  }
  cobertura.fontes.push(`${romaneios.length} romaneio(s) de terceiro vinculado(s) à OP`);
}

/**
 * @returns {Promise<{documentos:object[], cobertura:{fontes:string[], escopo:string, falhas:string[], consultadoEm:Date}}>}
 */
export async function documentosDaObra({ opId, opNumero }) {
  const documentos = [];
  const cobertura = { fontes: [], falhas: [], consultadoEm: new Date(), escopo: "" };

  // ⚠ Uma fonte que cai não derruba a outra: meia conferência explicada vale mais que nenhuma.
  try { await dasMedicoes(opId, documentos, cobertura); }
  catch (e) { cobertura.falhas.push(`medições: ${e.message}`); }
  try { await dosRomaneios(opId, opNumero, documentos, cobertura); }
  catch (e) { cobertura.falhas.push(`romaneios: ${e.message}`); }

  cobertura.escopo = cobertura.fontes.length
    ? cobertura.fontes.join(" e ")
    : "nenhuma fonte disponível para esta obra";
  return { documentos, cobertura };
}
