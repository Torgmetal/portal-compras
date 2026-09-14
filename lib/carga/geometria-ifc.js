// Geometria das marcas a partir do IFC da obra, no navegador (web-ifc): uma instância de cada marca
// pedida vira malha (vértices + índices, em mm, origem no canto) e caixa ORIENTADA.
//
// ⚠ Tekla exporta com Assemblies:On — a marca do CONJUNTO está no IfcElementAssembly (sem malha) e as
// partes chegam a ele por IfcRelAggregates. Peça solta (sem conjunto) usa a própria Tag. Parafusos
// (IfcMechanicalFastener) ficam de fora da caixa.
import { caixaOrientada } from "./geometria";

const limpaTag = (v) => String(v?.value ?? v ?? "").replace(/\(\?\)/g, "").trim().toUpperCase();
const limpaNome = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Casa cada marca pedida com UMA instância de conjunto do IFC.
 *
 * ⚠⚠ O IFC PODE SER DE ANTES DA REVISÃO QUE RENUMEROU A LISTA. OP-085 (14/09/2026): o modelo é de
 * 02/06 e a LPC R01 de 21/07 renumerou os guarda-corpos — na lista IPPE1100P7 é "CORRIMAO 840MM", no
 * IFC a tag IPPE1100P7 é "CORRIMAO 2081MM" (o P6 da lista). Casando só pela tag, 19 das 46 marcas
 * levavam a geometria da peça vizinha e 5 ficavam sem nada. Por isso, quando a lista traz a
 * descrição, ela é conferida com o Name do conjunto: se a tag existe e o nome bate, é ela; se a tag
 * não existe ou o nome é outro, vale o conjunto cujo Name é IGUAL à descrição — desde que o nome
 * seja específico (tem número, ex.: "CORRIMAO 2081MM") ou único no modelo. "VIGA" solta não casa
 * com viga nenhuma: chutar uma viga qualquer é pior que medir pelo peso.
 *
 * @param {Array<{id:number, tag:string, nome:string}>} conjuntos  assemblies do IFC
 * @param {Array<string|{marca:string, desc?:string}>} pedidos
 * @returns {{ instancia: Map<string, number>, porNome: string[] }}  marca → expressID do conjunto; marcas casadas pelo nome
 */
export function casarMarcas(conjuntos, pedidos) {
  const porTag = new Map(), porNome = new Map();
  for (const c of conjuntos) {
    if (c.tag && !porTag.has(c.tag)) porTag.set(c.tag, c);
    const n = limpaNome(c.nome); if (!n) continue;
    if (!porNome.has(n)) porNome.set(n, []); porNome.get(n).push(c);
  }
  const instancia = new Map(), casadasPeloNome = [];
  for (const p of pedidos) {
    const marca = limpaTag(typeof p === "string" ? p : p.marca), desc = limpaNome(typeof p === "string" ? "" : p.desc);
    if (!marca || instancia.has(marca)) continue;
    const c = porTag.get(marca);
    if (c && (!desc || limpaNome(c.nome) === desc)) { instancia.set(marca, c.id); continue; }
    const candidatos = desc ? porNome.get(desc) || [] : [];
    const especifico = /\d/.test(desc) || new Set(candidatos.map((x) => x.tag)).size === 1;
    if (candidatos.length && especifico) { instancia.set(marca, candidatos[0].id); casadasPeloNome.push(marca); continue; }
    if (c) instancia.set(marca, c.id); // tag existe com outro nome e nada casa pelo nome: fica a tag
  }
  return { instancia, porNome: casadasPeloNome };
}

/**
 * @param {Uint8Array} bytes  o arquivo IFC
 * @param {Array<string|{marca:string, desc?:string}>} marcas  marcas pedidas (com a descrição da lista, quando houver)
 * @param {(msg:string, frac:number)=>void} [progresso]
 * @returns {Promise<{ geometria: Record<string, {obb:object, dimsEixos:number[], temGeo:boolean, porNome?:boolean}>, malhas: Record<string, {pos:Float32Array, idx:Uint32Array}>, faltantes: string[], porNome: string[] }>}
 */
export async function geometriaDoIfc(bytes, marcas, progresso = () => {}) {
  const W = await import("web-ifc");
  const api = new W.IfcAPI(); api.SetWasmPath("/wasm/", true); // ⚠ o `true` (caminho absoluto) é obrigatório — ver VisualizadorIfc
  await api.Init();
  const pedidos = marcas.map((m) => (typeof m === "string" ? { marca: m } : m));
  const quero = new Set(pedidos.map((m) => String(m.marca).toUpperCase()));
  let model = -1;
  try {
    progresso("Abrindo o modelo…", 0.05);
    model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
    // conjunto → tag, e parte → conjunto
    const asmTag = new Map(), asmDe = new Map(), conjuntos = [];
    const asms = api.GetLineIDsWithType(model, W.IFCELEMENTASSEMBLY);
    for (let i = 0; i < asms.size(); i++) { const id = asms.get(i), l = api.GetLine(model, id); const tag = limpaTag(l.Tag) || limpaTag(l.Name); asmTag.set(id, tag); conjuntos.push({ id, tag, nome: limpaTag(l.Name) }); }
    const rels = api.GetLineIDsWithType(model, W.IFCRELAGGREGATES);
    for (let i = 0; i < rels.size(); i++) { const r = api.GetLine(model, rels.get(i)); const pai = r.RelatingObject?.value; if (!asmTag.has(pai)) continue; for (const o of r.RelatedObjects || []) asmDe.set(o.value, pai); }
    // uma instância por marca: pela tag e, quando a numeração do IFC não bate com a lista, pelo nome (ver casarMarcas)
    const casadas = casarMarcas(conjuntos, pedidos), porNome = new Set(casadas.porNome);
    const instanciaDaMarca = new Map();
    for (const [marca, id] of casadas.instancia) instanciaDaMarca.set(marca, `A${id}`);
    const todos = []; api.StreamAllMeshes(model, (m) => todos.push(m.expressID));
    const geo = new Map(); // chave da instância → {pos:[], idx:[]}
    const querInst = new Set(instanciaDaMarca.values());
    let feito = 0;
    for (let s = 0; s < todos.length; s += 50) {
      api.StreamMeshes(model, todos.slice(s, s + 50), (mesh) => {
        const line = api.GetLine(model, mesh.expressID);
        if (line.type === W.IFCMECHANICALFASTENER) return;
        const id = mesh.expressID, asm = asmDe.get(id); let chave = null;
        if (asm != null) chave = `A${asm}`;
        else { const tag = limpaTag(line.Tag); // peça solta, sem conjunto: a própria Tag é a marca
          if (quero.has(tag)) { if (!instanciaDaMarca.has(tag)) { instanciaDaMarca.set(tag, `E${id}`); querInst.add(`E${id}`); } if (instanciaDaMarca.get(tag) === `E${id}`) chave = `E${id}`; } }
        if (!chave || !querInst.has(chave)) return;
        const g = geo.get(chave) || { pos: [], idx: [] };
        for (let j = 0; j < mesh.geometries.size(); j++) {
          const pl = mesh.geometries.get(j), ge = api.GetGeometry(model, pl.geometryExpressID);
          try {
            const v = api.GetVertexArray(ge.GetVertexData(), ge.GetVertexDataSize()), ix = api.GetIndexArray(ge.GetIndexData(), ge.GetIndexDataSize());
            const m = pl.flatTransformation, base = g.pos.length / 3;
            for (let k = 0; k < v.length; k += 6) { const x = v[k], y = v[k + 1], z = v[k + 2]; g.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); }
            for (let k = 0; k < ix.length; k++) g.idx.push(base + ix[k]);
          } finally { ge.delete(); }
        }
        geo.set(chave, g);
      });
      feito += 50; if (feito % 500 === 0) { progresso(`Lendo a geometria… ${Math.min(100, Math.round(100 * feito / todos.length))} %`, 0.1 + 0.6 * Math.min(1, feito / todos.length)); await new Promise((r) => setTimeout(r, 0)); }
    }
    // ⚠ escala pela magnitude: em metros a maior peça fica em dezenas; em mm, em dezenas de milhar
    let ext = 0; for (const g of geo.values()) { const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < g.pos.length; k += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], g.pos[k + a]); max[a] = Math.max(max[a], g.pos[k + a]); } ext = Math.max(ext, ...max.map((v, i) => v - min[i])); }
    const escala = ext < 500 ? 1000 : 1;
    const geometria = {}, malhas = {}; let n = 0;
    for (const [tag, chave] of instanciaDaMarca) {
      const g = geo.get(chave); if (!g || !g.pos.length) continue;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < g.pos.length; k += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], g.pos[k + a]); max[a] = Math.max(max[a], g.pos[k + a]); }
      const pos = new Float32Array(g.pos.length); for (let k = 0; k < g.pos.length; k += 3) for (let a = 0; a < 3; a++) pos[k + a] = Math.round((g.pos[k + a] - min[a]) * escala);
      const obb = caixaOrientada(pos);
      geometria[tag] = { obb, dimsEixos: max.map((v, i) => Math.round((v - min[i]) * escala)), temGeo: true, porNome: porNome.has(tag) || undefined };
      malhas[tag] = { pos, idx: new Uint32Array(g.idx) };
      if (++n % 20 === 0) { progresso(`Medindo as peças… ${n} de ${instanciaDaMarca.size}`, 0.7 + 0.3 * n / instanciaDaMarca.size); await new Promise((r) => setTimeout(r, 0)); }
    }
    const faltantes = [...quero].filter((m) => !geometria[m]);
    return { geometria, malhas, faltantes, porNome: [...porNome].filter((m) => geometria[m]) };
  } finally { if (model >= 0) api.CloseModel(model); }
}
