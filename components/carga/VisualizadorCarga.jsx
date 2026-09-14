"use client";
// Visualizador 3D de uma carga simulada: caminhão, volumes posicionados, passo a passo da montagem.
// Só cliente (three.js) — quem usa carrega com next/dynamic({ ssr: false }).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Tag, Box } from "lucide-react";
import { enquadrarCameraCarga } from "@/lib/carga/enquadramento";
import { montarCaminhao } from "@/lib/carga/caminhao-3d";
import { MATERIAL_CINZA, montarCaibros, montarUnidade, rotuloVolume } from "@/lib/carga/cena-carga";

const mm = (v) => v / 1000;

/**
 * @param {{ carga: object, malhas?: object, madeira?: number, altura?: number }} props
 *   carga = uma carga da simulação (itens, passos, veiculo); malhas = geometria por marca (do IFC)
 */
// ⚠⚠ A API (capturar/enquadrar) SAI POR `apiRef`, NÃO SÓ PELO `ref`. O modal carrega este componente com
// `next/dynamic`, e o wrapper do dynamic NÃO repassa `ref` ao componente de dentro — `viz.current` ficava
// null para sempre e o botão "PDF do modelo" não fazia nada, em silêncio (Vitor, 14/09/2026: "não estou
// conseguindo exportar o pdf", pela segunda vez). Um prop comum passa por qualquer wrapper.
const VisualizadorCarga = forwardRef(function VisualizadorCarga({ carga, malhas, madeira = 100, altura = 480, apiRef = null }, ref) {
  const host = useRef(null), st = useRef(null);
  const [passo, setPasso] = useState(-1), [rotulos, setRotulos] = useState(true);

  // ── cena: uma vez por carga ──
  useEffect(() => {
    const el = host.current; if (!el || !carga) return;
    const W = el.clientWidth || 800, H = el.clientHeight || altura;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf0f3f6); scene.fog = new THREE.Fog(0xf0f3f6, 32, 85);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8;
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.05, 600);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d99a6, 0.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.5); sol.position.set(-8, 16, 10); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -14, right: 22, top: 12, bottom: -8, far: 60 }); sol.shadow.bias = -0.0002; sol.shadow.normalBias = 0.025; sol.shadow.radius = 3; scene.add(sol);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0xe8edf1, roughness: 0.95 })); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; scene.add(chao);
    const grade = new THREE.GridHelper(80, 40, 0xd6dfe6, 0xe0e7ed); grade.material.transparent = true; grade.material.opacity = 0.22; scene.add(grade);
    const V = carga.veiculo, veiculo3d = montarCaminhao(scene, V), C = mm(V.C), L = mm(V.L), A = mm(V.alturaUtil);
    const limite = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(C, A, L)), new THREE.LineBasicMaterial({ color: 0x5c839e, transparent: true, opacity: 0.35 })); limite.position.set(C / 2, A / 2, L / 2); scene.add(limite);
    chao.position.y = veiculo3d.solo - 0.01; grade.position.y = veiculo3d.solo - 0.005;
    const grupo = new THREE.Group(), grupoRot = new THREE.Group(); scene.add(grupo, grupoRot);
    const unidades = [], madeiras = [];
    const porId = new Map(carga.itens.map((u) => [u.id, u]));
    for (const u of carga.itens) { const g = montarUnidade(u, malhas); grupo.add(g); unidades.push(g); for (const m of montarCaibros(u, madeira, (u.sobre || []).map((id) => porId.get(id)).filter(Boolean))) { grupo.add(m); madeiras.push(m); } }
    const caixaCena = new THREE.Box3().setFromObject(veiculo3d.grupo).union(new THREE.Box3().setFromObject(limite)).union(new THREE.Box3().setFromObject(grupo));
    const enquadrar = (nome = "iso") => {
      const dir = { iso: new THREE.Vector3(-0.7, 0.48, 0.8), tras: new THREE.Vector3(1, 0.32, 0.55), topo: new THREE.Vector3(0, 1, 0.14), lado: new THREE.Vector3(0.001, 0.18, 1) }[nome];
      controls.target.copy(enquadrarCameraCarga(camera, caixaCena, dir)); controls.update();
      if (st.current) st.current.vista = nome;
    };
    const rotular = (visiveis) => { grupoRot.clear(); for (const g of unidades) if (g.visible) grupoRot.add(rotuloVolume(g.userData.u, st.current?.tamRotulo || 0.05)); grupoRot.visible = visiveis; };
    const pintar = (g, cinza) => g.traverse((o) => { if (!o.material || o.isSprite || o.isLineSegments) return; if (!o.userData.matOrig) o.userData.matOrig = o.material; o.material = cinza ? MATERIAL_CINZA : o.userData.matOrig; });
    const mostrarPasso = (p, camada = null) => {
      const ate = new Set(carga.passos.slice(0, p + 1)), atual = carga.passos[p];
      for (const g of unidades) { const u = g.userData.u; g.visible = ate.has(u.id); pintar(g, camada != null && (u.camada || 0) !== camada); g.traverse((o) => { if (o.material?.emissive && !o.userData.matOrigEm) o.material.emissive.setHex(u.id === atual && p < carga.passos.length - 1 && camada == null ? 0x554400 : 0); }); }
      for (const m of madeiras) { m.visible = ate.has(m.userData.pilhaDe); const u = carga.itens.find((x) => x.id === m.userData.pilhaDe); pintar(m, camada != null && (u?.camada || 0) !== camada); }
      rotular(st.current?.rotulos ?? true); };
    st.current = { renderer, scene, camera, controls, enquadrar, mostrarPasso, rotular, rotulos: true, vivo: true };
    enquadrar("iso"); mostrarPasso(carga.passos.length - 1);
    const loop = () => { if (!st.current?.vivo) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }; loop();
    const onResize = () => { const w = el.clientWidth || W, h = el.clientHeight || H; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); enquadrar(st.current?.vista || "iso"); };
    const observador = new ResizeObserver(onResize); observador.observe(el);
    return () => { st.current.vivo = false; observador.disconnect(); controls.dispose(); pm.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); st.current = null; };
  }, [carga, malhas, madeira, altura]);

  useEffect(() => { setPasso(carga ? carga.passos.length - 1 : -1); }, [carga]);
  useEffect(() => { if (st.current) { st.current.rotulos = rotulos; st.current.mostrarPasso(passo); } }, [passo, rotulos]);

  useImperativeHandle(apiRef || ref, () => ({
    /** Imagem PNG (data URL) da carga: vista iso|lado|topo|tras, opcionalmente só até a camada `ci` com as anteriores em cinza. */
    capturar(vista = "iso", ci = null) {
      const s = st.current; if (!s) return null;
      // tamanho fixo e pixelRatio 1: o PDF vai por upload e o corpo tem teto (~600 KB por imagem)
      const el = s.renderer.domElement, W0 = el.clientWidth, H0 = el.clientHeight, pr = s.renderer.getPixelRatio();
      const capturaW = 1600, capturaH = vista === "iso" || vista === "tras" ? 960 : 480;
      s.renderer.setPixelRatio(1); s.renderer.setSize(capturaW, capturaH, false); s.camera.aspect = capturaW / capturaH; s.camera.updateProjectionMatrix();
      s.rotulos = true; s.tamRotulo = 0.075;
      if (ci == null) s.mostrarPasso(carga.passos.length - 1); else { const byId = new Map(carga.itens.map((u) => [u.id, u])); let k = -1; carga.passos.forEach((id, i) => { if ((byId.get(id)?.camada || 0) === ci) k = i; }); s.mostrarPasso(k, ci); }
      s.enquadrar(vista); s.renderer.render(s.scene, s.camera);
      const url = el.toDataURL("image/jpeg", 0.8);
      s.renderer.setPixelRatio(pr); s.renderer.setSize(W0, H0); s.camera.aspect = W0 / H0; s.camera.updateProjectionMatrix();
      s.rotulos = rotulos; s.tamRotulo = 0.05; s.mostrarPasso(passo); s.enquadrar("iso"); return url;
    },
    /** Foto (JPEG data URL) de UM volume sozinho, em isométrica, com a embalagem dele — o desenho de referência do cartão no PDF. */
    capturarVolume(uId, W = 640, H = 400) {
      const s = st.current, u = carga?.itens?.find((i) => i.id === uId); if (!s || !u) return null;
      const cena = new THREE.Scene(); cena.background = new THREE.Color(0xffffff); cena.environment = s.scene.environment;
      cena.add(new THREE.HemisphereLight(0xffffff, 0x8d99a6, 0.7)); const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(-3, 6, 4); cena.add(sol);
      const g = montarUnidade({ ...u, x: 0, y: 0, z: 0, girada: false }, malhas); cena.add(g);
      const C = u.C / 1000, L = u.L / 1000, A = u.A / 1000, centro = new THREE.Vector3(C / 2, A / 2, L / 2), raio = Math.hypot(C, L, A) / 2;
      const cam = new THREE.PerspectiveCamera(28, W / H, 0.01, 200); const fov = cam.fov * Math.PI / 360;
      cam.position.copy(centro).addScaledVector(new THREE.Vector3(-0.75, 0.55, 1).normalize(), (raio / Math.sin(fov)) * 1.08); cam.lookAt(centro);
      const el = s.renderer.domElement, W0 = el.clientWidth, H0 = el.clientHeight, pr = s.renderer.getPixelRatio();
      s.renderer.setPixelRatio(1); s.renderer.setSize(W, H, false); s.renderer.render(cena, cam);
      const url = el.toDataURL("image/jpeg", 0.85);
      s.renderer.setPixelRatio(pr); s.renderer.setSize(W0, H0); s.renderer.render(s.scene, s.camera);
      cena.traverse((o) => { o.geometry?.dispose?.(); if (o.material && o.material !== MATERIAL_CINZA) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
      return url;
    },
    enquadrar: (v) => st.current?.enquadrar(v),
  }), [carga, passo, rotulos]);

  const n = carga?.passos?.length || 0, fim = passo >= n - 1, u = passo >= 0 && !fim ? carga.itens.find((x) => x.id === carga.passos[passo]) : null;
  const btn = "min-w-11 min-h-11 px-3 rounded-lg border border-slate-200 bg-white text-torg-dark hover:bg-slate-50 disabled:opacity-35 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-torg-blue";
  return (
    <section className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-[#eef2f6] min-w-0">
      <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap items-center gap-3">
        <h3 className="flex-1 text-base font-bold text-torg-dark inline-flex items-center gap-2"><Box size={19} className="text-torg-blue" /> Disposição da carga</h3>
        <div className="flex items-center gap-1 w-full sm:w-auto">
          {["iso", "lado", "topo", "tras"].map((v) => <button key={v} className={`${btn} text-xs max-sm:flex-1`} onClick={() => st.current?.enquadrar(v)}>{{ iso: "3D", lado: "Lateral", topo: "Cima", tras: "Trás" }[v]}</button>)}
          <button className={`${btn} ${rotulos ? "border-torg-blue text-torg-blue bg-torg-blue-50" : ""}`} onClick={() => setRotulos((r) => !r)} title="Números dos volumes" aria-label="Números dos volumes" aria-pressed={rotulos}><Tag size={17} /></button>
        </div>
      </div>
      <div ref={host} style={{ height: `clamp(280px, 48dvh, ${altura}px)` }} className="w-full overflow-hidden [&_canvas]:block" />
      <p className="text-[11px] text-torg-gray px-4 pb-3">Arraste para girar · use dois dedos ou a rolagem para aproximar</p>
      <div className="p-4 bg-white border-t border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Sequência de carregamento</p><p className="text-sm font-bold text-torg-dark mt-1" aria-live="polite">{fim ? `Carga completa · ${n} volumes` : passo < 0 ? "Veículo vazio" : `Volume ${u?.volume} · passo ${passo + 1} de ${n}`}</p></div>
          <div className="flex items-center gap-2">
            <button className={btn} onClick={() => setPasso(-1)} disabled={passo < 0} title="Caçamba vazia" aria-label="Caçamba vazia"><ChevronsLeft size={18} /></button>
            <button className={btn} onClick={() => setPasso((p) => Math.max(-1, p - 1))} disabled={passo < 0} title="Volume anterior" aria-label="Volume anterior"><ChevronLeft size={18} /></button>
            <button className={`${btn} flex-1 sm:flex-none gap-1.5`} onClick={() => setPasso((p) => Math.min(n - 1, p + 1))} disabled={fim} aria-label="Próximo volume"><span className="text-sm font-semibold">Próximo</span><ChevronRight size={18} /></button>
            <button className={btn} onClick={() => setPasso(n - 1)} disabled={fim} title="Carga completa" aria-label="Carga completa"><ChevronsRight size={18} /></button>
          </div>
        </div>
        <label className="block"><span className="sr-only">Etapa do carregamento</span><input type="range" min={-1} max={Math.max(-1, n - 1)} value={passo} onChange={(e) => setPasso(Number(e.target.value))} disabled={!n} className="w-full h-6 accent-torg-blue cursor-pointer" /></label>
        {u && <p className="text-xs text-torg-gray leading-relaxed">{u.rotulo} · {Math.round(u.kg || 0).toLocaleString("pt-BR")} kg · {u.C} × {u.L} × {u.A} mm · a {((u.x || 0) / 1000).toFixed(1).replace(".", ",")} m da frente{u.girada ? " · atravessado" : ""}</p>}
      </div>
    </section>
  );
});
export default VisualizadorCarga;
