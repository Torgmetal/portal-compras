"use client";
// Visualizador 3D de uma carga simulada: caminhão, volumes posicionados, passo a passo da montagem.
// Só cliente (three.js) — quem usa carrega com next/dynamic({ ssr: false }).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Tag } from "lucide-react";
import { montarCaminhao } from "@/lib/carga/caminhao-3d";
import { MATERIAL_CINZA, montarCaibros, montarUnidade, rotuloVolume } from "@/lib/carga/cena-carga";

const mm = (v) => v / 1000;

/**
 * @param {{ carga: object, malhas?: object, madeira?: number, altura?: number }} props
 *   carga = uma carga da simulação (itens, passos, veiculo); malhas = geometria por marca (do IFC)
 */
const VisualizadorCarga = forwardRef(function VisualizadorCarga({ carga, malhas, madeira = 100, altura = 480 }, ref) {
  const host = useRef(null), st = useRef(null);
  const [passo, setPasso] = useState(-1), [rotulos, setRotulos] = useState(true);

  // ── cena: uma vez por carga ──
  useEffect(() => {
    const el = host.current; if (!el || !carga) return;
    const W = el.clientWidth || 800, H = altura;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef2f6);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.05, 600);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d99a6, 0.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.5); sol.position.set(-6, 14, 8); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -14, right: 22, top: 12, bottom: -8, far: 60 }); sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.02; scene.add(sol);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0xdfe5eb })); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; scene.add(chao);
    const grade = new THREE.GridHelper(80, 80, 0xc5ced8, 0xd7dee6); scene.add(grade);
    const V = carga.veiculo, veiculo3d = montarCaminhao(scene, V), C = mm(V.C), L = mm(V.L), A = mm(V.alturaUtil);
    const limite = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(C, A, L)), new THREE.LineBasicMaterial({ color: 0xc0392b })); limite.position.set(C / 2, A / 2, L / 2); scene.add(limite);
    chao.position.y = veiculo3d.solo - 0.01; grade.position.y = veiculo3d.solo - 0.005;
    const grupo = new THREE.Group(), grupoRot = new THREE.Group(); scene.add(grupo, grupoRot);
    const unidades = [], madeiras = [];
    for (const u of carga.itens) { const g = montarUnidade(u, malhas); grupo.add(g); unidades.push(g); for (const m of montarCaibros(u, madeira)) { grupo.add(m); madeiras.push(m); } }
    // enquadra SÓ a caçamba num ângulo que mostra comprimento, altura e lado
    const enquadrar = (nome = "iso") => {
      const alvo = new THREE.Vector3(C / 2, A * 0.45, L / 2);
      const dir = { iso: new THREE.Vector3(0.62, 0.42, 0.66), tras: new THREE.Vector3(1, 0.32, 0.55), topo: new THREE.Vector3(0, 1, 0.14), lado: new THREE.Vector3(0.001, 0.18, 1) }[nome].normalize();
      const fov = camera.fov * Math.PI / 180, hfov = Math.atan(Math.tan(fov / 2) * camera.aspect); let dist;
      if (nome === "topo") dist = Math.max((C / 2 + 0.6) / Math.tan(hfov), (L / 2 + 0.6) / Math.tan(fov / 2)) + A / 2;
      else if (nome === "lado") { alvo.y = A / 2 + 0.2; dist = Math.max((C / 2 + 0.6) / Math.tan(hfov), (A / 2 + 0.9) / Math.tan(fov / 2)) + L / 2; }
      else { const raio = Math.sqrt((C / 2) ** 2 + (L / 2) ** 2 + (A / 2) ** 2) * 0.74; dist = raio / Math.sin(Math.min(fov / 2, hfov * 0.95)); }
      camera.position.copy(alvo).addScaledVector(dir, dist); controls.target.copy(alvo); controls.update(); };
    const escalaRotulo = Math.max(0.42, C / 20);
    const rotular = (visiveis) => { grupoRot.clear(); for (const g of unidades) if (g.visible) grupoRot.add(rotuloVolume(g.userData.u, escalaRotulo)); grupoRot.visible = visiveis; };
    const pintar = (g, cinza) => g.traverse((o) => { if (!o.material || o.isSprite || o.isLineSegments) return; if (!o.userData.matOrig) o.userData.matOrig = o.material; o.material = cinza ? MATERIAL_CINZA : o.userData.matOrig; });
    const mostrarPasso = (p, camada = null) => {
      const ate = new Set(carga.passos.slice(0, p + 1)), atual = carga.passos[p];
      for (const g of unidades) { const u = g.userData.u; g.visible = ate.has(u.id); pintar(g, camada != null && (u.camada || 0) !== camada); g.traverse((o) => { if (o.material?.emissive && !o.userData.matOrigEm) o.material.emissive.setHex(u.id === atual && p < carga.passos.length - 1 && camada == null ? 0x554400 : 0); }); }
      for (const m of madeiras) { m.visible = ate.has(m.userData.pilhaDe); const u = carga.itens.find((x) => x.id === m.userData.pilhaDe); pintar(m, camada != null && (u?.camada || 0) !== camada); }
      rotular(st.current?.rotulos ?? true); };
    st.current = { renderer, scene, camera, controls, enquadrar, mostrarPasso, rotular, rotulos: true, vivo: true };
    enquadrar("iso"); mostrarPasso(carga.passos.length - 1);
    const loop = () => { if (!st.current?.vivo) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }; loop();
    const onResize = () => { const w = el.clientWidth || W; camera.aspect = w / H; camera.updateProjectionMatrix(); renderer.setSize(w, H); }; window.addEventListener("resize", onResize);
    return () => { st.current.vivo = false; window.removeEventListener("resize", onResize); controls.dispose(); pm.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); st.current = null; };
  }, [carga, malhas, madeira, altura]);

  useEffect(() => { setPasso(carga ? carga.passos.length - 1 : -1); }, [carga]);
  useEffect(() => { if (st.current) { st.current.rotulos = rotulos; st.current.mostrarPasso(passo); } }, [passo, rotulos]);

  useImperativeHandle(ref, () => ({
    /** Imagem PNG (data URL) da carga: vista iso|lado|topo|tras, opcionalmente só até a camada `ci` com as anteriores em cinza. */
    capturar(vista = "iso", ci = null) {
      const s = st.current; if (!s) return null;
      // tamanho fixo e pixelRatio 1: o PDF vai por upload e o corpo tem teto (~600 KB por imagem)
      const el = s.renderer.domElement, W0 = el.clientWidth, H0 = el.clientHeight, pr = s.renderer.getPixelRatio();
      s.renderer.setPixelRatio(1); s.renderer.setSize(1200, 560, false); s.camera.aspect = 1200 / 560; s.camera.updateProjectionMatrix();
      s.rotulos = true;
      if (ci == null) s.mostrarPasso(carga.passos.length - 1); else { const byId = new Map(carga.itens.map((u) => [u.id, u])); let k = -1; carga.passos.forEach((id, i) => { if ((byId.get(id)?.camada || 0) === ci) k = i; }); s.mostrarPasso(k, ci); }
      s.enquadrar(vista); s.renderer.render(s.scene, s.camera);
      const url = el.toDataURL("image/jpeg", 0.8);
      s.renderer.setPixelRatio(pr); s.renderer.setSize(W0, H0); s.camera.aspect = W0 / H0; s.camera.updateProjectionMatrix();
      s.rotulos = rotulos; s.mostrarPasso(passo); s.enquadrar("iso"); return url;
    },
    enquadrar: (v) => st.current?.enquadrar(v),
  }), [carga, passo, rotulos]);

  const n = carga?.passos?.length || 0, fim = passo >= n - 1, u = passo >= 0 && !fim ? carga.itens.find((x) => x.id === carga.passos[passo]) : null;
  const btn = "px-2 py-1 rounded-md border border-gray-200 bg-white text-torg-dark hover:bg-gray-50 disabled:opacity-40 inline-flex items-center";
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden bg-[#eef2f6]">
      <div ref={host} style={{ height: altura }} className="w-full" />
      <div className="px-3 py-2 bg-white border-t border-gray-100 flex flex-wrap items-center gap-2 text-[12px]">
        <button className={btn} onClick={() => setPasso(-1)} title="Caçamba vazia"><ChevronsLeft size={14} /></button>
        <button className={btn} onClick={() => setPasso((p) => Math.max(-1, p - 1))} title="Volume anterior"><ChevronLeft size={14} /></button>
        <button className={btn} onClick={() => setPasso((p) => Math.min(n - 1, p + 1))} title="Próximo volume"><ChevronRight size={14} /></button>
        <button className={btn} onClick={() => setPasso(n - 1)} title="Carga completa"><ChevronsRight size={14} /></button>
        <span className="text-torg-gray">{fim ? <><b className="text-torg-dark">Carga completa</b> · {n} volumes</> : passo < 0 ? "Use ▶ para montar volume a volume" : <><b className="text-torg-dark">Volume {u?.volume}</b> · passo {passo + 1} de {n} · {u?.rotulo} · {Math.round(u?.kg || 0)} kg · {u?.C}×{u?.L}×{u?.A} mm · a {((u?.x || 0) / 1000).toFixed(1)} m da frente{u?.girada ? " · atravessado" : ""}</>}</span>
        <span className="ml-auto flex items-center gap-1">
          {["iso", "lado", "topo", "tras"].map((v) => <button key={v} className={btn} onClick={() => st.current?.enquadrar(v)}>{{ iso: "3D", lado: "Lateral", topo: "Cima", tras: "Trás" }[v]}</button>)}
          <button className={`${btn} ${rotulos ? "border-torg-blue text-torg-blue" : ""}`} onClick={() => setRotulos((r) => !r)} title="Números dos volumes"><Tag size={14} /></button>
        </span>
      </div>
    </div>
  );
});
export default VisualizadorCarga;
