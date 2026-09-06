"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { compararElementosIfc } from "@/lib/ifc-comparacao";
import { carregarIfcComparacao } from "@/lib/ifc-comparacao-carregar";
import { configurarLuzesIfc } from "@/lib/ifc-visual";

const CORES = { adicionado: 0x159768, removido: 0xd44450, alterado: 0xd99514, conferir: 0x8857bc, igual: 0xb6c0c9 };
const NOMES = { adicionado: "Adicionados", removido: "Removidos", alterado: "Alterados", conferir: "A conferir", igual: "Sem diferenças detectadas" };
export default function ComparadorIfc({ atualUrl, anteriorUrl, atualNome, anteriorNome, onFechar }) {
  const box = useRef(null), viewer = useRef(null);
  const [estado, setEstado] = useState("Preparando comparação…"), [erro, setErro] = useState("");
  const [dados, setDados] = useState(null), [tentativa, setTentativa] = useState(0);
  const [contexto, setContexto] = useState(true), [busca, setBusca] = useState(""), [filtro, setFiltro] = useState("todos");
  const [selecionada, setSelecionada] = useState(null);
  useEffect(() => {
    const abort = new AbortController(); let limpar = () => {};
    setErro(""); setDados(null); setSelecionada(null);
    (async () => {
      try {
        const antes = await carregarIfcComparacao(anteriorUrl, (n) => setEstado(`Lendo revisão anterior · ${n}%`), abort.signal);
        const depois = await carregarIfcComparacao(atualUrl, (n) => setEstado(`Lendo revisão atual · ${n}%`), abort.signal);
        if (abort.signal.aborted) return;
        const comparacao = compararElementosIfc(antes, depois).map((e, i) => ({ ...e, key: i }));
        setEstado("Preparando as diferenças…");
        const T = await import("three"), { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js"), { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
        if (abort.signal.aborted || !box.current) return;
        const scene = new T.Scene(); scene.background = new T.Color("white"); configurarLuzesIfc(T, scene, false, true);
        const renderer = new T.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); box.current.appendChild(renderer.domElement);
        const cam = new T.PerspectiveCamera(40, 1, .01, 10000), ctrl = new OrbitControls(cam, renderer.domElement);
        const bounds = new T.Box3();
        comparacao.forEach((r) => [r.anterior, r.atual].filter(Boolean).forEach((e) => e.geometrias.forEach((g) => { for (let k = 0; k < g.pos.length; k += 3) bounds.expandByPoint(new T.Vector3(...g.pos.slice(k, k + 3))); })));
        const origem = bounds.getCenter(new T.Vector3()), groups = new Map(), individuais = new Map(), meshes = [];
        for (const r of comparacao) {
          const gs = [];
          // Alterados mostram as duas posições; igualdade só desenha a revisão atual.
          for (const e of (r.status === "alterado" ? [r.anterior, r.atual] : [r.atual || r.anterior])) {
            for (const d of e.geometrias) {
              const pos = d.pos.map((v, i) => v - origem.getComponent(i % 3));
              const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(d.nor, 3)); g.setIndex(d.indices); gs.push(g);
            }
          }
          if (!gs.length) continue;
          const g = mergeGeometries(gs); gs.forEach((v) => v.dispose()); individuais.set(r.key, g);
          if (!groups.has(r.status)) groups.set(r.status, []); groups.get(r.status).push(g);
        }
        for (const [status, gs] of groups) {
          const material = new T.MeshPhongMaterial({ color: CORES[status], side: T.DoubleSide, transparent: status === "igual", opacity: status === "igual" ? .08 : 1, depthWrite: status !== "igual" });
          const mesh = new T.Mesh(mergeGeometries(gs), material); mesh.userData.status = status; scene.add(mesh); meshes.push(mesh);
        }
        const destaque = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0x006eab, wireframe: true, depthTest: false })); destaque.visible = false; scene.add(destaque);
        const draw = () => renderer.render(scene, cam);
        const frame = (b) => { const c = b.getCenter(new T.Vector3()), tam = Math.max(.1, b.getSize(new T.Vector3()).length()); ctrl.target.copy(c); cam.position.copy(c).add(new T.Vector3(.8,.55,.8).normalize().multiplyScalar(tam * 1.3)); cam.far = Math.max(100, tam * 100); cam.updateProjectionMatrix(); ctrl.update(); draw(); };
        const geral = bounds.clone().translate(origem.clone().negate());
        const resize = () => { if (!box.current) return; const w = box.current.clientWidth || 600, h = box.current.clientHeight || 520; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); draw(); };
        const ro = new ResizeObserver(resize); ro.observe(box.current); ctrl.addEventListener("change", draw);
        viewer.current = {
          atualizar(ctx, tipo) { meshes.forEach((m) => m.visible = m.userData.status === "igual" ? ctx : tipo === "todos" || m.userData.status === tipo); destaque.visible = false; draw(); },
          focar(key) { const g = individuais.get(key); if (!g) return; destaque.geometry = g; destaque.visible = true; g.computeBoundingBox(); frame(g.boundingBox); },
          enquadrar() { destaque.visible = false; frame(geral); },
        };
        limpar = () => { viewer.current = null; ro.disconnect(); ctrl.dispose(); meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); individuais.forEach((g) => g.dispose()); destaque.material.dispose(); renderer.dispose(); renderer.domElement.remove(); };
        resize(); frame(geral); setDados(comparacao); setEstado("");
      } catch (e) { if (!abort.signal.aborted) setErro(e.message || "Não consegui comparar os IFCs."); }
    })();
    return () => { abort.abort(); limpar(); };
  }, [atualUrl, anteriorUrl, tentativa]);
  useEffect(() => { viewer.current?.atualizar(contexto, filtro); setSelecionada(null); }, [contexto, filtro, dados]);
  const diferentes = useMemo(() => (dados || []).filter((r) => r.status !== "igual"), [dados]);
  const lista = diferentes.filter((r) => (filtro === "todos" || r.status === filtro) && `${r.atual?.marca || r.anterior?.marca} ${r.atual?.nome || r.anterior?.nome} ${r.atual?.guid || r.anterior?.guid}`.toLowerCase().includes(busca.toLowerCase()));
  const comuns = (dados || []).filter((r) => r.anterior && r.atual).length;
  return <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
    <div className="flex justify-between gap-3"><h3 className="font-semibold text-torg-dark">Comparação de revisões</h3><button onClick={onFechar} className="text-torg-blue">Voltar ao modelo</button></div>
    <p className="text-sm">Anterior: {anteriorNome}<br />Atual: {atualNome}</p>
    <p className="text-xs text-torg-gray">Compara geometria, posição, nome, marca e classe dos elementos com identificador único. Tolerância de 1 mm. Não compara todos os atributos de engenharia; mudanças na triangulação podem aparecer como diferenças.</p>
    {erro ? <div role="alert" className="text-sm text-red-700">{erro} <button className="underline" onClick={() => setTentativa((v) => v + 1)}>Tentar novamente</button></div> : !dados && <p role="status">{estado}</p>}
    {dados && <>
      {comuns < dados.length * .2 && <p className="text-sm text-amber-800 bg-amber-50 p-2">Poucos identificadores coincidem. Os arquivos podem ter escopos diferentes ou ter sido reexportados com novos identificadores. Adições e remoções precisam de conferência.</p>}
      <div className="flex gap-3 flex-wrap text-xs">{Object.entries(NOMES).map(([k,n]) => <span key={k} style={{ color: `#${CORES[k].toString(16).padStart(6,"0")}` }}>{n}: {dados.filter((r) => r.status === k).length}</span>)}</div>
      {!diferentes.length && <p>Nenhuma diferença detectada nos campos e geometrias comparados.</p>}
      <div className="flex gap-3 flex-wrap text-sm"><label><input type="checkbox" checked={contexto} onChange={(e) => setContexto(e.target.checked)} /> Mostrar contexto</label><button onClick={() => viewer.current?.enquadrar()} className="text-torg-blue">Enquadrar tudo</button><select aria-label="Tipo de diferença" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todos">Todas as diferenças</option>{Object.entries(NOMES).filter(([k])=>k!=="igual").map(([k,n])=><option value={k} key={k}>{n}</option>)}</select></div>
    </>}
    <div ref={box} style={{ height: 520 }} className="w-full min-w-0" />
    {dados && <><input className="border rounded p-2 w-full text-sm" aria-label="Buscar na comparação" placeholder="Buscar marca, nome ou identificador…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="max-h-60 overflow-auto">{lista.slice(0,300).map((r) => <button key={r.key} className={`block w-full text-left p-2 border-b text-sm ${selecionada === r.key ? "bg-blue-50" : ""}`} onClick={() => { setSelecionada(r.key); viewer.current?.focar(r.key); }}>{NOMES[r.status]} · {(r.atual || r.anterior).marca || "Sem marca"} · {(r.atual || r.anterior).nome}<span className="block text-xs text-torg-gray">{r.motivo} · {(r.atual || r.anterior).guid || "Sem identificador"}</span></button>)}</div>
      {lista.length > 300 && <p className="text-xs">Exibindo 300 de {lista.length}. Use a busca para localizar os demais.</p>}
    </>}
  </section>;
}
