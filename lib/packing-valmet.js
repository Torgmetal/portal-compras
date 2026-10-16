// ─── PACKING LIST DA VALMET — as linhas ──────────────────────────────────────────────────────────
//
// Vitor (16/10/2026): "para as obras da Valmet teremos esse modelo, precisa acessar a pasta da obra e verificar as
// informações e preencher todas as informações". O que cada coluna leva (decidido por ele, no mesmo dia):
//   - Order Item: o nº do VOLUME (como nos romaneios 01/02 feitos à mão);
//   - TAG: a marca da Torg;
//   - Valmet Code: o "Desenho Valmet" da Lista de Equivalência Torg × Valmet (lib/packing-valmet-fontes.js);
//   - Desenho e Código do material: em branco (na coluna do código, o comentário da própria Valmet diz "Not Use");
//   - Nr. do Pacote: a fórmula do modelo (NF + fornecedor) — fica na planilha (lib/packing-valmet-excel.js).
// Medidas e madeira vêm da simulação de carga quando ela bate com o romaneio (a mesma regra do FOR-081 da TMSA).
import { simulacaoBate, pesoMadeiraKg } from "./romaneio-tmsa";

export const ehObraValmet = (op) => /\bVALMET\b/i.test(String(op?.cliente || ""));

const RX_FIXACAO = /\b(parafuso|porca|arruela)\b/i;
/** Fixação vai em pallet e área coberta; peça de estrutura vai solta, área aberta (o que o romaneio 01 usou). */
export const embalagemDaLinha = (descricao) => (RX_FIXACAO.test(String(descricao || ""))
  ? { tipo: "Palette", armazenamento: "S2 Área coberta" }
  : { tipo: "Solta", armazenamento: "S1 Área aberta" });

const chave = (s) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * @param {{ itens:{marca,descricao,qtd,pesoKg}[], volumes?:object[]|null, equivalencia?:Map<string,{valmet}> }} x
 */
export function montarPackingValmet({ itens = [], volumes = null, equivalencia = new Map() }) {
  const avisos = [];
  const porMarca = new Map(itens.map((it) => [chave(it.marca), it]));
  const unitKg = (k) => { const it = porMarca.get(k); return it && Number(it.qtd) > 0 ? (Number(it.pesoKg) || 0) / Number(it.qtd) : 0; };

  const bate = simulacaoBate(itens, volumes);
  if (!bate.ok && bate.motivo) avisos.push(`Sem medidas da simulação: ${bate.motivo}.`);
  const fonte = bate.ok
    ? bate.volumes.map((v) => ({ dims: Array.isArray(v.dimsCm) ? v.dimsCm : null, madeira: v.madeira || {}, itens: v.itens }))
    : itens.filter((it) => Number(it.qtd) > 0).map((it) => ({ dims: null, madeira: {}, itens: [{ marca: it.marca, qtd: it.qtd }] }));

  const linhas = [];
  const semCodigo = new Set();
  let kgLiquido = 0, kgMadeira = 0, m3 = 0;
  fonte.forEach((v, i) => {
    kgMadeira += pesoMadeiraKg(v.madeira);
    if (v.dims) m3 += v.dims.reduce((p, d) => p * (Number(d) || 0) / 100, 1);
    for (const x of v.itens) {
      const k = chave(x.marca), it = porMarca.get(k), qtd = Number(x.qtd) || 0;
      const peso = r2(unitKg(k) * qtd);
      kgLiquido += peso;
      const valmetCode = equivalencia.get(k)?.valmet || null;
      if (!valmetCode) semCodigo.add(it?.marca || x.marca);
      linhas.push({
        item: linhas.length + 1, volume: i + 1, dims: v.dims, descricao: String(it?.descricao || "PEÇA").trim(), qtd, pesoKg: peso,
        valmetCode, tag: it?.marca || x.marca, ...embalagemDaLinha(it?.descricao),
      });
    }
  });

  if (semCodigo.size) {
    const lista = [...semCodigo];
    avisos.push(`${lista.length} marca(s) fora da Lista de Equivalência Torg × Valmet — saem sem Valmet Code: ${lista.slice(0, 8).join(", ")}${lista.length > 8 ? "…" : ""}.`);
  }
  kgLiquido = r2(kgLiquido);
  return {
    origem: bate.ok ? "simulacao" : "manual",
    linhas,
    totais: { kgLiquido, kgBruto: r2(kgLiquido + kgMadeira), m3: r3(m3), volumes: fonte.length, dims: fonte.length === 1 ? fonte[0].dims : null },
    avisos,
  };
}
