import "server-only";
import { prisma } from "./prisma";
import { TIPO_LABEL } from "./qualidade-campo";
import { linhasReprovadas, rotuloRevisao } from "./revisao-inspecao";
import { DESCONTINUIDADES } from "./evs-campos";

// A RNC QUE NASCE DE UMA INSPEÇÃO REPROVADA.
//
// Vitor (21/08/2026): "no caso do relatório reprovado deverá já ser aberta uma RNC inclusive".
//
// Faz sentido e fecha um buraco real: hoje a reprovação vive só dentro do relatório, e quem trata
// não conformidade (análise de causa, disposição, plano de ação) só fica sabendo se alguém contar.
// Abrindo a RNC na hora, o retrabalho entra no fluxo do PO-07 sem depender de ninguém lembrar.
//
// ⚠ UMA RNC POR RELATÓRIO, não por revisão. Reprovou em R00, reparou, reprovou de novo em R01 — é a
// MESMA não conformidade, que ainda não foi resolvida. Abrir uma por rodada encheria o indicador de
// RNCs com repetições do mesmo problema e faria a fábrica parecer pior do que é.

/** O texto da ocorrência, montado do que de fato reprovou. */
export function descreverReprovacao(rel) {
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const idx = linhasReprovadas(linhas);
  const partes = [];

  for (const i of idx) {
    const l = linhas[i];
    if (l.encontradoMm != null && l.projetoMm != null) {
      const dif = Number(l.encontradoMm) - Number(l.projetoMm);
      partes.push(
        `${l.descricao || l.marca || `linha ${i + 1}`}: projeto ${l.projetoMm} mm${l.tolerancia ? ` (${l.tolerancia})` : ""}` +
        `, encontrado ${l.encontradoMm} mm — desvio de ${dif > 0 ? "+" : ""}${Math.round(dif * 10) / 10} mm.`,
      );
      continue;
    }
    const cods = String(l.descontinuidade || "").split(/[\s,;]+/).filter(Boolean);
    const nomes = cods.map((c) => DESCONTINUIDADES.find((d) => d.c === c)?.nome || c);
    partes.push(
      `${l.marca || `junta ${i + 1}`}${l.descricao ? ` (${l.descricao})` : ""}: ` +
      `${nomes.length ? nomes.join(", ") : "reprovada"}` +
      `${l.soldador ? ` — soldador ${l.sinete ? `${l.sinete} ` : ""}${l.soldador}` : ""}` +
      `${l.eps ? `, ${l.eps}` : ""}.`,
    );
  }

  const cab = `Reprovação registrada no ${rel.codigo} (${TIPO_LABEL[rel.tipo] || rel.tipo}), ${rotuloRevisao(rel.revisao)}.`;
  const criterio = rel.resultados?.criterio ? `\n\nCritério de aceitação: ${rel.resultados.criterio}.` : "";
  // ⚠ o texto lista CADA ponto reprovado com o número medido. RNC que diz só "peça reprovada" não
  // permite análise de causa nenhuma — e é a análise que o PO-07 cobra.
  return `${cab}\n\n${partes.join("\n") || "Sem detalhamento das linhas reprovadas."}${criterio}`;
}

/**
 * Abre (ou atualiza) a RNC da reprovação.
 *
 * @returns {Promise<{criada:boolean, id:string, numero:number, ano:number}|null>}
 */
export async function abrirRNCdeReprovacao(rel, { userId = null, elaborador = null } = {}) {
  if (rel?.resultadoInspecao !== "REPROVADO") return null;

  const descricao = descreverReprovacao(rel);
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.join(", ") : null;

  // ⚠ já existe? atualiza o texto com a rodada nova em vez de abrir outra
  if (rel.rncId) {
    const existente = await prisma.naoConformidade.findUnique({ where: { id: rel.rncId }, select: { id: true, numero: true, ano: true, status: true } });
    if (existente) {
      if (existente.status !== "ENCERRADA") {
        await prisma.naoConformidade.update({ where: { id: existente.id }, data: { descricao } }).catch(() => {});
      }
      return { criada: false, ...existente };
    }
  }

  const op = rel.opId ? null : await prisma.oP.findFirst({ where: { numero: rel.opNumero }, select: { id: true, cliente: true } });
  const dt = new Date();
  const ano = dt.getUTCFullYear();
  const ultima = await prisma.naoConformidade.findFirst({ where: { ano }, orderBy: { numero: "desc" }, select: { numero: true } });

  const rnc = await prisma.naoConformidade.create({
    data: {
      numero: (ultima?.numero || 0) + 1,
      ano,
      tipo: "INTERNA",
      data: dt,
      // ⚠ origem PRODUTO: a não conformidade é da peça, não do processo nem do fornecedor. É o que
      // faz a RNC cair no indicador certo.
      origem: "PRODUTO",
      cliente: op?.cliente || null,
      opNumero: rel.opNumero || null,
      opId: rel.opId || op?.id || null,
      desenhoProjetoMarca: marcas,
      processoArea: rel.tipo === "VISUAL_SOLDA" ? "Soldagem" : "Produção",
      descricao,
      elaborador: elaborador || rel.inspetor || null,
      // ⚠ a disposição NÃO é preenchida aqui. Retrabalhar, refugar ou aprovar por concessão é
      // decisão da Qualidade com a Engenharia — o inspetor constata, não decide o destino da peça.
      relatorioInspecaoId: rel.id,
      createdById: userId,
    },
    select: { id: true, numero: true, ano: true },
  });

  await prisma.relatorioInspecao.update({ where: { id: rel.id }, data: { rncId: rnc.id } }).catch(() => {});
  return { criada: true, ...rnc };
}
