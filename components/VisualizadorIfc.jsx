"use client";
// ─── VISUALIZADOR DE MODELO IFC ───────────────────────────────────────────────
//
// Vitor (03/09/2026): "não está aparecendo os perfis, o Tekla lê com muito mais detalhe, quero que
// seja exatamente igual ao Tekla" — e, sobre o cliente: "quero que vejam dentro do portal deles,
// não quero que seja através de um link".
//
// ⚠⚠ POR QUE UM MOTOR DE VERDADE, E NÃO DESENHO À MÃO. Eu tentei extrair a geometria do IFC na
// unha, duas vezes: na primeira esqueci de compor as ROTAÇÕES da cadeia de encaixe e as peças
// apontavam para direções inexistentes; na segunda acertei a direção mas cada peça saía como uma
// LINHA, sem seção. O arquivo tem tudo o que falta — IFCISHAPEPROFILEDEF com as medidas reais
// (W150X18 = 102×153×5,8×7,1×7,9), 398 perfis de contorno livre, 450 operações de corte —, mas
// transformar isso em sólido é escrever um renderizador de IFC. `web-ifc` já é esse renderizador.
//
// ⚠⚠ O CLIQUE É NOSSO, E ESSE É O MOTIVO DE NÃO USARMOS O VISUALIZADOR DO TRIMBLE. Vitor: "o duro
// seria essa seleção". Aqui o mesh clicado devolve o expressID, que sobe pela IFCRELAGGREGATES até
// o IFCELEMENTASSEMBLY, de onde sai a Tag — a MARCA. É com a marca que o portal responde R,
// croquis, setor e liberação. Dentro do Trimble esse elo teria de morar no ambiente deles.
//
// ⚠ SEM REDE EXTERNA: o .wasm é servido de /wasm do próprio portal (copiado de node_modules no
// build). O portal do cliente não pode depender de CDN nem de conta de terceiro.
import { useEffect, useRef, useState, useCallback } from "react";

const COR_PADRAO = 0x9fb0bf;
const COR_SEL = 0xf4801f;

/**
 * @param {string} url      de onde baixar o IFC (rota do portal)
 * @param {(marca:string|null)=>void} onSelecionar  chamado com a marca do conjunto clicado
 * @param {Record<string,string>} [cores]  marca → cor hex ("#0E7A5F"), para pintar por andamento
 * @param {string|null} [selecionada]      marca destacada de fora (a lista, por exemplo)
 */
export default function VisualizadorIfc({ url, onSelecionar, cores, selecionada, altura = 520 }) {
  const box = useRef(null);
  const ref = useRef({});             // guarda three/api entre renders sem provocar re-render
  const [estado, setEstado] = useState({ fase: "carregando", pct: 0 });
  const [info, setInfo] = useState(null);

  // ⚠⚠ A CADEIA expressID → MARCA, montada UMA VEZ ao abrir o modelo.
  // Um IFCELEMENTASSEMBLY agrega suas peças por IFCRELAGGREGATES; a marca fica no campo Tag do
  // assembly (medido no export do Tekla 2025 da OP-089: 246 das 250 marcas casaram com a LPC).
  // Fazer essa subida a cada clique custaria uma varredura por clique — e o clique tem de ser
  // instantâneo, senão a tela parece travada.
  const montarMapa = (api, modelID) => {
    const marcaDe = new Map();        // expressID da peça → marca do conjunto
    const marcaDoAsm = new Map();     // expressID do assembly → marca
    try {
      const asms = api.GetLineIDsWithType(modelID, 4123344466 /* IFCELEMENTASSEMBLY */);
      for (let i = 0; i < asms.size(); i++) {
        const id = asms.get(i);
        const l = api.GetLine(modelID, id);
        const tag = l?.Tag?.value;
        if (tag) marcaDoAsm.set(id, String(tag).replace(/\(\?\)/g, "").trim());
      }
      const rels = api.GetLineIDsWithType(modelID, 160246688 /* IFCRELAGGREGATES */);
      for (let i = 0; i < rels.size(); i++) {
        const l = api.GetLine(modelID, rels.get(i));
        const pai = l?.RelatingObject?.value;
        const marca = marcaDoAsm.get(pai);
        if (!marca) continue;
        for (const f of l?.RelatedObjects || []) if (f?.value != null) marcaDe.set(f.value, marca);
      }
      // o próprio assembly também responde, para o caso de o mesh vir no nível dele
      for (const [id, m] of marcaDoAsm) marcaDe.set(id, m);
    } catch (e) {
      console.error("[ifc] falha ao montar o mapa de marcas:", e?.message);
    }
    return { marcaDe, total: marcaDoAsm.size };
  };

  useEffect(() => {
    let vivo = true;
    let limpar = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const WebIFC = await import("web-ifc");
        if (!vivo) return;

        setEstado({ fase: "baixando", pct: 0 });
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Não consegui baixar o modelo (${res.status}).`);
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!vivo) return;

        setEstado({ fase: "lendo", pct: 0 });
        const api = new WebIFC.IfcAPI();
        // ⚠⚠ O `true` É OBRIGATÓRIO. Sem ele o web-ifc resolve o caminho RELATIVO ao chunk que o
        // carregou e vai buscar /_next/static/chunks/wasm/web-ifc.wasm — 404, e o erro que chega é
        // "both async and sync fetching of the wasm failed", que não diz nada sobre rota.
        api.SetWasmPath("/wasm/", true);
        await api.Init();
        const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
        const { marcaDe, total } = montarMapa(api, modelID);

        // ── cena ──
        const el = box.current;
        const cena = new THREE.Scene();
        cena.background = new THREE.Color(0xffffff);   // Vitor pediu fundo branco
        const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
        const rend = new THREE.WebGLRenderer({ antialias: true });
        rend.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.innerHTML = "";
        el.appendChild(rend.domElement);
        rend.setSize(el.clientWidth || 800, altura);
        cena.add(new THREE.AmbientLight(0xffffff, 0.75));
        const sol = new THREE.DirectionalLight(0xffffff, 0.9); sol.position.set(1, 2, 1.4); cena.add(sol);
        const sol2 = new THREE.DirectionalLight(0xffffff, 0.35); sol2.position.set(-1, -0.6, -1); cena.add(sol2);

        // ── malha: uma por MARCA, para pintar e destacar por conjunto ──
        setEstado({ fase: "montando", pct: 0 });
        const porMarca = new Map();    // marca → array de geometrias
        let n = 0;
        api.StreamAllMeshes(modelID, (mesh) => {
          const marca = marcaDe.get(mesh.expressID) || null;
          const g = mesh.geometries;
          for (let i = 0; i < g.size(); i++) {
            const p = g.get(i);
            const geo = api.GetGeometry(modelID, p.geometryExpressID);
            const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
            const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
            const pos = new Float32Array(v.length / 2), nor = new Float32Array(v.length / 2);
            for (let k = 0, j = 0; k < v.length; k += 6, j += 3) {
              pos[j] = v[k]; pos[j + 1] = v[k + 1]; pos[j + 2] = v[k + 2];
              nor[j] = v[k + 3]; nor[j + 1] = v[k + 4]; nor[j + 2] = v[k + 5];
            }
            const bg = new THREE.BufferGeometry();
            bg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
            bg.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
            bg.setIndex(new THREE.BufferAttribute(new Uint32Array(ix), 1));
            bg.applyMatrix4(new THREE.Matrix4().fromArray(p.flatTransformation));
            geo.delete();
            const chave = marca || "__sem_marca__";
            (porMarca.get(chave) || porMarca.set(chave, []).get(chave)).push(bg);
            n++;
          }
        });

        // ⚠ junta as geometrias de cada marca numa malha só: 1.500 objetos separados derrubam o
        // quadro por causa das chamadas de desenho; por marca dá algumas centenas.
        const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
        const malhas = new Map();
        for (const [marca, gs] of porMarca) {
          const junta = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
          if (!junta) continue;
          const cor = cores?.[marca] ? new THREE.Color(cores[marca]) : new THREE.Color(COR_PADRAO);
          const mat = new THREE.MeshLambertMaterial({ color: cor, side: THREE.DoubleSide });
          const m = new THREE.Mesh(junta, mat);
          m.userData.marca = marca === "__sem_marca__" ? null : marca;
          cena.add(m); malhas.set(marca, m);
          gs.forEach((g2) => { if (g2 !== junta) g2.dispose(); });
        }
        api.CloseModel(modelID);

        // ── enquadra ──
        // ⚠ ENQUADRA PELA ESFERA QUE ENVOLVE A OBRA, não por um múltiplo do tamanho: a distância
        // certa depende do campo de visão da câmera, senão obra comprida sai cortada e obra
        // pequena fica um ponto no meio da tela.
        cam.aspect = (el.clientWidth || 800) / altura; cam.updateProjectionMatrix();
        const cx = new THREE.Box3().setFromObject(cena);
        const centro = cx.getCenter(new THREE.Vector3());
        const raio = cx.getSize(new THREE.Vector3()).length() / 2 || 5;
        const dist = (raio / Math.sin((cam.fov * Math.PI / 180) / 2)) * 1.15;
        const dir = new THREE.Vector3(0.72, 0.48, 0.72).normalize();
        cam.position.copy(centro).addScaledVector(dir, dist);
        cam.near = Math.max(0.05, dist / 800); cam.far = dist * 12;
        cam.lookAt(centro);
        cam.updateProjectionMatrix();

        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const ctrl = new OrbitControls(cam, rend.domElement);
        ctrl.target.copy(centro); ctrl.enableDamping = true; ctrl.update();

        const medir = () => {
          const w = el.clientWidth || 800, h = el.clientHeight || altura;
          // ⚠ sem atualizar o CSS do canvas (3º argumento), o buffer fica 800×520 e o elemento
          // continua nos 300×150 padrão do <canvas> — a obra aparece espremida num canto.
          rend.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
        };
        medir();
        window.addEventListener("resize", medir);

        // ── clique ──
        const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
        let arrastou = false;
        const down = () => { arrastou = false; };
        const move = () => { arrastou = true; };
        const up = (ev) => {
          if (arrastou) return;                 // girou a câmera: não é seleção
          const r = rend.domElement.getBoundingClientRect();
          pt.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
          pt.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
          ray.setFromCamera(pt, cam);
          const hit = ray.intersectObjects([...malhas.values()], false)[0];
          onSelecionar?.(hit?.object?.userData?.marca || null);
        };
        rend.domElement.addEventListener("pointerdown", down);
        rend.domElement.addEventListener("pointermove", move);
        rend.domElement.addEventListener("pointerup", up);

        let raf = 0;
        const anima = () => { raf = requestAnimationFrame(anima); ctrl.update(); rend.render(cena, cam); };
        anima();

        ref.current = { THREE, cena, malhas, rend, cam, ctrl };
        setInfo({ conjuntos: total, malhas: malhas.size, geometrias: n });
        setEstado({ fase: "pronto" });

        limpar = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", medir);
          rend.domElement.removeEventListener("pointerdown", down);
          rend.domElement.removeEventListener("pointermove", move);
          rend.domElement.removeEventListener("pointerup", up);
          ctrl.dispose();
          for (const m of malhas.values()) { m.geometry.dispose(); m.material.dispose(); }
          rend.dispose();
          if (el) el.innerHTML = "";
        };
      } catch (e) {
        console.error("[ifc]", e);
        if (vivo) setEstado({ fase: "erro", erro: e?.message || "Falha ao abrir o modelo." });
      }
    })();
    return () => { vivo = false; limpar(); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠ destaque vindo de fora (clique na lista) — sem remontar a cena
  useEffect(() => {
    const { THREE, malhas } = ref.current || {};
    if (!THREE || !malhas) return;
    for (const [marca, m] of malhas) {
      const base = cores?.[marca] || `#${COR_PADRAO.toString(16)}`;
      m.material.color.set(marca === selecionada ? `#${COR_SEL.toString(16)}` : base);
    }
  }, [selecionada, cores]);

  const rot = { carregando: "preparando…", baixando: "baixando o modelo…", lendo: "lendo o IFC…", montando: "montando as peças…" };

  return (
    <div className="relative bg-white" style={{ minHeight: altura }}>
      <div ref={box} style={{ height: altura }} />
      {estado.fase !== "pronto" && estado.fase !== "erro" && (
        <div className="absolute inset-0 grid place-items-center bg-white/85">
          <p className="text-[13px] text-torg-gray">{rot[estado.fase] || "abrindo…"}</p>
        </div>
      )}
      {estado.fase === "erro" && (
        <div className="absolute inset-0 grid place-items-center bg-white p-6">
          <p className="text-[13px] text-red-600 text-center max-w-sm">{estado.erro}</p>
        </div>
      )}
      {info && (
        <div className="absolute left-3 top-3 text-[10.5px] font-semibold text-torg-gray bg-gray-50 border border-gray-200 rounded px-2 py-1">
          {info.conjuntos} conjuntos · {info.geometrias} peças
        </div>
      )}
    </div>
  );
}
