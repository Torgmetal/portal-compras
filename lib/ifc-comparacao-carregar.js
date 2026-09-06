import { canonizarTriangulosIfc } from "./ifc-comparacao";

export async function carregarIfcComparacao(url, progresso, signal) {
  const [T, W] = await Promise.all([import("three"), import("web-ifc")]);
  const r = await fetch(url, { signal, cache: "no-store" });
  if (!r.ok) { const falha = await r.json().catch(() => ({})); throw new Error(falha.error || "Não consegui baixar uma das revisões. Verifique se a comparação continua publicada."); }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > 60 * 1024 * 1024) throw new Error("Cada IFC deve ter até 60 MB.");
  const api = new W.IfcAPI(); api.SetWasmPath("/wasm/");
  let model;
  const checar = () => { if (signal.aborted) throw Object.assign(new Error("Cancelado"), { name: "AbortError" }); };
  try {
    await api.Init(); checar();
    // Mesma referência espacial para os dois arquivos; nunca recentrar independentemente.
    model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
    const ids = [], elementos = [];
    api.StreamAllMeshes(model, (m) => ids.push(m.expressID));
    if (ids.length > 50000) throw new Error("Modelo com elementos demais para esta comparação no navegador.");
    let totalVertices = 0;
    for (let start = 0; start < ids.length; start += 40) {
      checar(); const lote = [];
      api.StreamMeshes(model, ids.slice(start, start + 40), (mesh) => {
        const line = api.GetLine(model, mesh.expressID), geometrias = [], assinatura = [];
        for (let j = 0; j < mesh.geometries.size(); j++) {
          const placement = mesh.geometries.get(j), geo = api.GetGeometry(model, placement.geometryExpressID);
          try {
            const vertices = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
            const indices = Array.from(api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()));
            totalVertices += vertices.length / 6;
            if (totalVertices > 4000000) throw new Error("Geometria grande demais para comparar neste navegador.");
            const matrix = new T.Matrix4().fromArray(placement.flatTransformation), normalMatrix = new T.Matrix3().getNormalMatrix(matrix);
            const pos = [], nor = [];
            for (let k = 0; k < vertices.length; k += 6) {
              pos.push(...new T.Vector3(vertices[k], vertices[k + 1], vertices[k + 2]).applyMatrix4(matrix).toArray());
              nor.push(...new T.Vector3(vertices[k + 3], vertices[k + 4], vertices[k + 5]).applyNormalMatrix(normalMatrix).toArray());
            }
            assinatura.push(canonizarTriangulosIfc(pos, indices));
            geometrias.push({ pos, nor, indices });
          } finally { geo.delete(); }
        }
        const val = (v) => String(v?.value ?? "");
        lote.push({ id: mesh.expressID, guid: val(line.GlobalId), nome: val(line.Name), marca: val(line.Tag), meta: JSON.stringify([val(line.Name), val(line.Tag), line.type]), geometrias, assinatura: assinatura.sort().join("#") });
      });
      for (const e of lote) {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e.assinatura));
        e.hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
        delete e.assinatura; elementos.push(e);
      }
      progresso(Math.min(100, Math.round((start + 40) / Math.max(1, ids.length) * 100)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!elementos.length) throw new Error("IFC sem geometria comparável.");
    return elementos;
  } finally { if (model !== undefined) api.CloseModel(model); api.Dispose?.(); }
}
