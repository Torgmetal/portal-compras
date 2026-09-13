// Geometria das marcas a partir do IFC da obra, no navegador (web-ifc): uma instância de cada marca
// pedida vira malha (vértices + índices, em mm, origem no canto) e caixa ORIENTADA.
//
// ⚠ Tekla exporta com Assemblies:On — a marca do CONJUNTO está no IfcElementAssembly (sem malha) e as
// partes chegam a ele por IfcRelAggregates. Peça solta (sem conjunto) usa a própria Tag. Parafusos
// (IfcMechanicalFastener) ficam de fora da caixa.
import { caixaOrientada } from "./geometria";

const limpaTag = (v) => String(v?.value ?? v ?? "").replace(/\(\?\)/g, "").trim().toUpperCase();

/**
 * @param {Uint8Array} bytes  o arquivo IFC
 * @param {string[]} marcas  marcas pedidas (maiúsculas)
 * @param {(msg:string, frac:number)=>void} [progresso]
 * @returns {Promise<{ geometria: Record<string, {obb:object, dimsEixos:number[], temGeo:boolean}>, malhas: Record<string, {pos:Float32Array, idx:Uint32Array}>, faltantes: string[] }>}
 */
export async function geometriaDoIfc(bytes, marcas, progresso = () => {}) {
  const W = await import("web-ifc");
  const api = new W.IfcAPI(); api.SetWasmPath("/wasm/", true); // ⚠ o `true` (caminho absoluto) é obrigatório — ver VisualizadorIfc
  await api.Init();
  const quero = new Set(marcas.map((m) => String(m).toUpperCase()));
  let model = -1;
  try {
    progresso("Abrindo o modelo…", 0.05);
    model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
    // conjunto → tag, e parte → conjunto
    const asmTag = new Map(), asmDe = new Map();
    const asms = api.GetLineIDsWithType(model, W.IFCELEMENTASSEMBLY);
    for (let i = 0; i < asms.size(); i++) { const id = asms.get(i), l = api.GetLine(model, id); asmTag.set(id, limpaTag(l.Tag) || limpaTag(l.Name)); }
    const rels = api.GetLineIDsWithType(model, W.IFCRELAGGREGATES);
    for (let i = 0; i < rels.size(); i++) { const r = api.GetLine(model, rels.get(i)); const pai = r.RelatingObject?.value; if (!asmTag.has(pai)) continue; for (const o of r.RelatedObjects || []) asmDe.set(o.value, pai); }
    // uma instância por marca: a primeira que aparecer
    const instanciaDaMarca = new Map();
    for (const [id, tag] of asmTag) if (quero.has(tag) && !instanciaDaMarca.has(tag)) instanciaDaMarca.set(tag, `A${id}`);
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
      geometria[tag] = { obb, dimsEixos: max.map((v, i) => Math.round((v - min[i]) * escala)), temGeo: true };
      malhas[tag] = { pos, idx: new Uint32Array(g.idx) };
      if (++n % 20 === 0) { progresso(`Medindo as peças… ${n} de ${instanciaDaMarca.size}`, 0.7 + 0.3 * n / instanciaDaMarca.size); await new Promise((r) => setTimeout(r, 0)); }
    }
    const faltantes = [...quero].filter((m) => !geometria[m]);
    return { geometria, malhas, faltantes };
  } finally { if (model >= 0) api.CloseModel(model); }
}
