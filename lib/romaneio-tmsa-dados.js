// ─── OS DADOS DO FOR-081 DA TMSA ─────────────────────────────────────────────────────────────────
//
// O que o romaneio da TMSA precisa e o portal já guarda (lib/romaneio-tmsa.js monta as linhas):
//   - TAG de cada PEÇA: `EtiquetaCampoExtra.tagCliente`, por (marca, unidade), da "Lista de Equivalência de TAG" que a
//     tela de etiquetas importa (lib/parse-equivalencia-tag.js);
//   - OC de cada TAG: as Referências do cliente na OP (`OPReferencia`, árvore TPR → OC → [item] → TAG) — Vitor
//     (15/10/2026): "temos casos de ter OCs diferentes para a mesma obra, ou seja, as TAGs são para cada OC";
//   - TPR: a referência de projeto (ou o que estiver em `OP.refCliente`);
//   - volumes: os da ÚLTIMA simulação de carga do romaneio prévio, quando se escolhe segui-la.
import "server-only";
import { prisma } from "./prisma";

const chave = (s) => String(s ?? "").trim().toUpperCase();
const chaveTag = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function dadosTmsa({ op, previoId, seguirSimulacao = true }) {
  const variantes = [...new Set([String(op.numero), String(Number(op.numero)), String(op.numero).padStart(3, "0")])];
  const [linhas, refs, sim] = await Promise.all([
    prisma.etiquetaCampoExtra.findMany({ where: { opNumero: { in: variantes }, tagCliente: { not: null } }, select: { marca: true, unidade: true, tagCliente: true } }),
    prisma.oPReferencia.findMany({ where: { opId: op.id }, select: { id: true, paiId: true, papel: true, codigo: true } }),
    seguirSimulacao && previoId
      ? prisma.cargaSimulada.findFirst({ where: { romaneioPrevioId: previoId }, orderBy: { createdAt: "desc" }, select: { cargas: true } })
      : null,
  ]);

  const tags = new Map();
  for (const l of linhas) {
    const k = chave(l.marca);
    if (!tags.has(k)) tags.set(k, []);
    tags.get(k).push({ unidade: Number(l.unidade) || 1, tag: String(l.tagCliente).trim() });
  }
  for (const v of tags.values()) v.sort((a, b) => a.unidade - b.unidade);

  const porId = new Map(refs.map((r) => [r.id, r]));
  const ocPorTag = new Map();
  for (const t of refs.filter((r) => r.papel === "tag")) {
    let x = porId.get(t.paiId), guarda = 0;
    while (x && x.papel !== "pedido" && guarda++ < 10) x = porId.get(x.paiId);
    if (x?.papel === "pedido") ocPorTag.set(chaveTag(t.codigo), x.codigo);
  }
  const tpr = refs.find((r) => r.papel === "projeto")?.codigo || (String(op.refCliente || "").match(/TPR[\s-]*\d+/i)?.[0] ?? null);

  // as cargas da simulação em sequência: volume 1, 2, 3… através dos caminhões
  const volumes = sim ? (Array.isArray(sim.cargas) ? sim.cargas : []).flatMap((c) => (Array.isArray(c.romaneio) ? c.romaneio : [])).map((v, i) => ({ ...v, volume: i + 1 })) : null;
  return { tags, ocPorTag, tpr, volumes };
}
