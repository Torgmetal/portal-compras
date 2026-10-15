// ─── ROMANEIO NO MODELO DA TMSA (FOR-081) ───────────────────────────────────────────────────────
//
// Vitor (15/10/2026): "precisamos implantar para as obras da TMSA esse padrão de Romaneio, isso será apenas para as
// obras da TMSA". O que cada campo leva (decidido por ele, no mesmo dia):
//   - Nº do romaneio: sequência 1, 2, 3 POR OP (o número do romaneio prévio);
//   - data do embarque: a da EMISSÃO;
//   - referência de projeto: "TPR do cliente / OP da Torg";
//   - campo livre do fornecedor: os dados da Torg;
//   - tipo da embalagem: "VOLUME 1", "VOLUME 2"…; dimensões: as dos pacotes da SIMULAÇÃO de carga, quando se escolhe
//     segui-la; peso: líquido = peças, bruto = peças + madeira do volume (média de eucalipto e pinus);
//   - TAG: o número da TMSA de cada PEÇA (lista de equivalência de TAG); quantidade: o que vai de fato;
//   - código: a OC à qual aquela TAG pertence ("temos OCs diferentes para a mesma obra — as TAGs são para cada OC");
//   - descrição: nome da peça + marca Torg.
// Layout: o do modelo, sem mudar nada (lib/romaneio-tmsa-excel.js). Puro: só a montagem das linhas.

/** Média de eucalipto (~750) e pinus (~500) — "não precisa ter 100% de certeza" (Vitor). */
export const KG_M3_MADEIRA = 625;
// as peças que o simulador conta (lib/carga/madeira.js): caibro 5×6 cm e sarrafo 2,5×5 cm de 3 m; tábua de 0,9 m² × 2,5 cm
const M3_POR_PECA = { caibro: 3 * 0.05 * 0.06, sarrafo: 3 * 0.025 * 0.05, tabua: 0.9 * 0.025 };

export const ehObraTmsa = (op) => /\bTMSA\b/i.test(String(op?.cliente || ""));

export const referenciaProjeto = (tpr, opNumero) => [String(tpr || "").trim(), `OP-${opNumero}`].filter(Boolean).join(" / ");

/** kg de madeira de um volume, pelas peças que o simulador contou ({ caibro, sarrafo, tabua }). */
export function pesoMadeiraKg(madeira = {}) {
  const m3 = Object.entries(M3_POR_PECA).reduce((s, [k, v]) => s + (Number(madeira?.[k]) || 0) * v, 0);
  return Math.round(m3 * KG_M3_MADEIRA * 10) / 10;
}

const chave = (s) => String(s ?? "").trim().toUpperCase();
const chaveTag = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const r1 = (v) => Math.round(v * 10) / 10;

// a simulação serve se cobre EXATAMENTE as quantidades emitidas, marca a marca
function simulacaoBate(itens, volumes) {
  if (!Array.isArray(volumes) || !volumes.length) return { ok: false, motivo: null };
  // ⚠ simulação gravada antes de 15/10/2026 não traz a contagem por marca: volume de UMA marca ainda serve (a
  // quantidade é a do volume); com várias marcas no mesmo volume não há como dividir, e aí é simular de novo
  volumes = volumes.map((v) => (Array.isArray(v.itens) ? v : Array.isArray(v.marcas) && v.marcas.length === 1 ? { ...v, itens: [{ marca: v.marcas[0], qtd: Number(v.pecas) || 0 }] } : v));
  if (volumes.some((v) => !Array.isArray(v.itens))) return { ok: false, motivo: "a simulação gravada é de antes da contagem por marca e tem volume com várias marcas — rode a simulação de novo" };
  const emitido = new Map(), simulado = new Map();
  for (const it of itens) emitido.set(chave(it.marca), (emitido.get(chave(it.marca)) || 0) + (Number(it.qtd) || 0));
  for (const v of volumes) for (const x of v.itens) simulado.set(chave(x.marca), (simulado.get(chave(x.marca)) || 0) + (Number(x.qtd) || 0));
  const difere = [...new Set([...emitido.keys(), ...simulado.keys()])].filter((k) => (emitido.get(k) || 0) !== (simulado.get(k) || 0));
  return difere.length
    ? { ok: false, motivo: `a simulação não bate com as quantidades deste romaneio (${difere.slice(0, 4).join(", ")}${difere.length > 4 ? "…" : ""}) — simule de novo` }
    : { ok: true, volumes };
}

/**
 * As embalagens e as linhas do FOR-081.
 * @param {{ itens:{marca,descricao,qtd,pesoKg}[], volumes?:{volume,dimsCm,madeira,itens:{marca,qtd}[]}[]|null,
 *           tags?:Map<string,{unidade,tag}[]>, ocPorTag?:Map<string,string> }} x
 */
export function montarRomaneioTmsa({ itens = [], volumes = null, tags = new Map(), ocPorTag = new Map(), ocDe = null }) {
  // a OC por (TAG, marca): das Referências da OP e das ETCs da TMSA (lib/romaneio-tmsa-dados.js); sem isso, só o mapa por TAG
  const ocDaLinha = ocDe || ((tag) => ocPorTag.get(chaveTag(tag)) || null);
  const avisos = [];
  const porMarca = new Map(itens.map((it) => [chave(it.marca), it]));
  const unitKg = (k) => { const it = porMarca.get(k); return it && Number(it.qtd) > 0 ? (Number(it.pesoKg) || 0) / Number(it.qtd) : 0; };
  const usadas = new Map(); // quantas unidades de cada marca já foram para volumes anteriores

  const bate = simulacaoBate(itens, volumes);
  if (!bate.ok && bate.motivo) avisos.push(`Sem medidas da simulação: ${bate.motivo}.`);
  const fonte = bate.ok
    ? bate.volumes.map((v) => ({ dims: Array.isArray(v.dimsCm) ? v.dimsCm : null, madeira: v.madeira || {}, itens: v.itens }))
    : itens.filter((it) => Number(it.qtd) > 0).map((it) => ({ dims: null, madeira: {}, itens: [{ marca: it.marca, qtd: it.qtd }] }));

  const embalagens = fonte.map((v, i) => {
    const linhas = [];
    let kgLiquido = 0;
    for (const x of v.itens) {
      const k = chave(x.marca), it = porMarca.get(k);
      const qtd = Number(x.qtd) || 0;
      kgLiquido += unitKg(k) * qtd;
      const ini = usadas.get(k) || 0;
      usadas.set(k, ini + qtd);
      // ⚠ a TAG é da UNIDADE (a 2ª peça da marca pode ir para outro transportador). Unidade sem TAG sai sem TAG:
      // herdar a de outra unidade poria a peça no equipamento errado (mesma regra das etiquetas).
      const unidades = tags.get(k) || [];
      const porTag = new Map();
      for (let u = ini + 1; u <= ini + qtd; u++) {
        const tag = unidades.find((t) => Number(t.unidade) === u)?.tag || null;
        porTag.set(tag, (porTag.get(tag) || 0) + 1);
      }
      for (const [tag, n] of porTag) {
        linhas.push({ tag, qtd: n, codigo: tag ? ocDaLinha(tag, it?.marca || x.marca) : null, descricao: `${it?.descricao || "PEÇA"} — ${it?.marca || x.marca}` });
      }
    }
    kgLiquido = r1(kgLiquido);
    return { numero: i + 1, tipo: `VOLUME ${i + 1}`, dims: v.dims, kgLiquido, kgBruto: r1(kgLiquido + pesoMadeiraKg(v.madeira)), linhas };
  });

  if (embalagens.some((e) => e.linhas.some((l) => !l.tag))) avisos.push("Há peças sem TAG na lista de equivalência da TMSA — saem com a TAG em branco.");
  if (embalagens.some((e) => e.linhas.some((l) => l.tag && !l.codigo))) avisos.push("Há TAGs sem OC encontrada (nas Referências da OP nem nas ETCs da TMSA) — o código sai em branco.");
  return {
    origem: bate.ok ? "simulacao" : "manual",
    embalagens,
    totais: {
      embalagens: embalagens.length,
      kgLiquido: r1(embalagens.reduce((s, e) => s + e.kgLiquido, 0)),
      kgBruto: r1(embalagens.reduce((s, e) => s + e.kgBruto, 0)),
    },
    avisos,
  };
}
