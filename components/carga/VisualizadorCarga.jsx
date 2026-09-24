"use client";
// Visualizador 3D de uma carga simulada: caminhão, volumes posicionados, passo a passo da montagem.
// Só cliente (three.js) — quem usa carrega com next/dynamic({ ssr: false }).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Tag, Box, Move, MoveVertical, RotateCw, ZoomIn, ZoomOut, Focus } from "lucide-react";
import { enquadrarCameraCarga } from "@/lib/carga/enquadramento";
import { montarCaminhao } from "@/lib/carga/caminhao-3d";
import { MATERIAL_CINZA, montarCaibros, montarEscoras, montarUnidade, rotuloVolume } from "@/lib/carga/cena-carga";

import { ajustarVolume, recalcularMontagem, posicaoDoArraste, sobreposicaoNoArraste, rotacaoDaUnidade, girarVolumeNoCentro, limitesRotacionados } from "@/lib/carga/montagem-manual";

const mm = (v) => v / 1000;

/**
 * @param {{ carga: object, malhas?: object, madeira?: number, altura?: number }} props
 *   carga = uma carga da simulação (itens, passos, veiculo); malhas = geometria por marca (do IFC)
 */
// ⚠⚠ A API (capturar/enquadrar) SAI POR `apiRef`, NÃO SÓ PELO `ref`. O modal carrega este componente com
// `next/dynamic`, e o wrapper do dynamic NÃO repassa `ref` ao componente de dentro — `viz.current` ficava
// null para sempre e o botão "PDF do modelo" não fazia nada, em silêncio (Vitor, 14/09/2026: "não estou
// conseguindo exportar o pdf", pela segunda vez). Um prop comum passa por qualquer wrapper.
const VisualizadorCarga = forwardRef(function VisualizadorCarga({ carga, malhas, madeira = 100, altura = 480, apiRef = null, volumeSelecionado = null, onSelecionarVolume = null, onAlterarMontagem = null, onDesfazer = null, podeDesfazer = false, preencher = false }, ref) {
  const host = useRef(null), st = useRef(null), cameraAnterior = useRef(null), selecionarRef = useRef(onSelecionarVolume);
  selecionarRef.current = onSelecionarVolume;
  const alterarRef = useRef(onAlterarMontagem), gestoRef=useRef({modo:'mover',encaixe:true});
  alterarRef.current=onAlterarMontagem;
  const [vista,setVista]=useState('iso'),[modo,setModo]=useState('mover'),[encaixe,setEncaixe]=useState(false),[eixo,setEixo]=useState('y'),[movimento,setMovimento]=useState(null);
  gestoRef.current={modo,encaixe,eixo};
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
    for (const u of carga.itens) { const g = montarUnidade({...u,rotacaoManual:rotacaoDaUnidade(u)}, malhas); grupo.add(g); unidades.push(g); for (const m of [...montarCaibros(u, madeira, (u.sobre || []).map((id) => porId.get(id)).filter(Boolean)), ...montarEscoras(u, madeira, porId)]) { grupo.add(m); madeiras.push(m); } }
    const caixaCena = new THREE.Box3().setFromObject(veiculo3d.grupo).union(new THREE.Box3().setFromObject(limite)).union(new THREE.Box3().setFromObject(grupo));
    const enquadrar = (nome = "iso") => {
      setVista(nome);
      const dir = { iso: new THREE.Vector3(-0.7, 0.48, 0.8), tras: new THREE.Vector3(1, 0.32, 0.55), topo: new THREE.Vector3(0, 1, 0.14), lado: new THREE.Vector3(0.001, 0.18, 1) }[nome];
      controls.target.copy(enquadrarCameraCarga(camera, caixaCena, dir)); controls.update();
      if (st.current) {st.current.vista = nome;st.current.atualizar=true;}
    };
    const rotular = (visiveis) => { for(const r of [...grupoRot.children]){r.material.map?.dispose();r.material.dispose();grupoRot.remove(r);}for (const g of unidades) if (g.visible) {const r=rotuloVolume(g.userData.u,st.current?.tamRotulo||0.05);r.userData.volume=g.userData.u.id;grupoRot.add(r);}grupoRot.visible=visiveis; };
    const pintar = (g, cinza) => g.traverse((o) => { if (!o.material || o.isSprite || o.isLineSegments) return; if (!o.userData.matOrig) o.userData.matOrig = o.material; o.material = cinza ? MATERIAL_CINZA : o.userData.matOrig; });
    const mostrarPasso = (p, camada = null, destacar = null) => {
      const ate = new Set(carga.passos.slice(0, p + 1)), atual = carga.passos[p];
      for (const g of unidades) { const u = g.userData.u; g.visible = ate.has(u.id); pintar(g, destacar ? u.id !== destacar : camada != null && (u.camada || 0) !== camada); g.traverse((o) => { if (o.material?.emissive && !o.userData.matOrigEm) o.material.emissive.setHex(u.id === atual && p < carga.passos.length - 1 && camada == null ? 0x554400 : 0); }); }
      for (const m of madeiras) { m.visible = ate.has(m.userData.pilhaDe); const u = carga.itens.find((x) => x.id === m.userData.pilhaDe); pintar(m, destacar ? u?.id !== destacar : camada != null && (u?.camada || 0) !== camada); }
      rotular(st.current?.rotulos ?? true);if(st.current)st.current.atualizar=true; };
    const selecionador=new THREE.BoxHelper(undefined,0xf4801f);selecionador.visible=false;scene.add(selecionador);
    const chaveCamera=JSON.stringify([V.chave,V.C,V.L,carga.itens.map(u=>u.id)]);
    const ray=new THREE.Raycaster();let inicio=null,arraste=null;
    const ponteiro=(e)=>{const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);};
    const encontrar=(e)=>{ponteiro(e);const h=ray.intersectObjects(unidades.filter(g=>g.visible),true).find(h=>h.object.isMesh);if(!h)return null;let g=h.object;while(g&&!unidades.includes(g))g=g.parent;return g?{g,ponto:h.point}:null;};
    const aplicarPrevia=(pos)=>{
      if(!arraste)return;
      const {u,g,origem,acessorios}=arraste,delta=new THREE.Vector3(mm(pos.x-u.x),mm(pos.y-u.y),mm(pos.z-u.z));
      if(pos.rotacaoManual){const r=pos.rotacaoManual,min=limitesRotacionados(u,r).min;g.rotation.set(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180,'XYZ');g.position.set(mm(pos.x-min[0]),mm(pos.y-min[1]),mm(pos.z-min[2]));}
      else {g.position.copy(origem).add(delta);g.rotation.copy(arraste.rotacao);}
      for(const a of acessorios){a.obj.position.copy(a.pos).add(delta);a.obj.visible=pos.rotacaoManual?false:a.visivel;}
      g.updateMatrixWorld(true);selecionador.setFromObject(g);selecionador.visible=true;
      const colisao=sobreposicaoNoArraste(carga,pos.rotacaoManual?pos:u,pos);selecionador.material.color.setHex(colisao?0xdc2626:0xf4801f);
      arraste.pos=pos;st.current.atualizar=true;setMovimento({volume:u.volume,x:pos.x,y:pos.y,z:pos.z,rotacao:pos.rotacaoManual,colisao});
    };
    const finalizar=(cancelar=false)=>{
      if(!arraste)return;
      const a=arraste;
      if(cancelar)aplicarPrevia({x:a.u.x,y:a.u.y,z:a.u.z});
      arraste=null;inicio=null;controls.enabled=true;setMovimento(null);selecionador.material.color.setHex(0xf4801f);
      if(renderer.domElement.hasPointerCapture(a.pointerId))renderer.domElement.releasePointerCapture(a.pointerId);
      if(!cancelar&&a.pos&&(['x','y','z'].some(k=>a.pos[k]!==a.u[k])||a.pos.rotacaoManual&&['x','y','z'].some(k=>a.pos.rotacaoManual[k]!==rotacaoDaUnidade(a.u)[k])))alterarRef.current?.(recalcularMontagem({...carga,itens:carga.itens.map(u=>u.id===a.u.id?ajustarVolume(u,{...a.pos,rotacao:a.pos.rotacaoManual}):u)},madeira));
    };
    const aoPressionar=(e)=>{
      if(arraste||e.button!==0||e.isPrimary===false)return;
      inicio={x:e.clientX,y:e.clientY};
      if(!alterarRef.current||gestoRef.current.modo==='camera')return;
      const hit=encontrar(e);if(!hit)return;
      e.preventDefault();e.stopPropagation();controls.enabled=false;
      const {g,ponto}=hit,u=g.userData.u;selecionarRef.current?.(u.id);
      const normal=gestoRef.current.modo==='altura'?new THREE.Vector3(camera.position.x-controls.target.x,0,camera.position.z-controls.target.z).normalize():new THREE.Vector3(0,1,0);
      if(normal.lengthSq()<0.001)normal.set(0,0,1);
      const plano=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,ponto);
      const acessorios=[...madeiras.filter(m=>m.userData.pilhaDe===u.id),...grupoRot.children.filter(r=>r.userData.volume===u.id)].map(obj=>({obj,pos:obj.position.clone(),visivel:obj.visible}));
      arraste={g,u,rotacao:g.rotation.clone(),origem:g.position.clone(),ponto:ponto.clone(),plano,acessorios,pointerId:e.pointerId,modo:gestoRef.current.modo,eixo:gestoRef.current.eixo};
      renderer.domElement.setPointerCapture(e.pointerId);setMovimento({volume:u.volume,x:u.x,y:u.y,z:u.z,colisao:false});
    };
    const aoMover=(e)=>{
      if(!arraste||e.pointerId!==arraste.pointerId)return;e.preventDefault();e.stopPropagation();
      if(Math.hypot(e.clientX-inicio.x,e.clientY-inicio.y)<3)return;
      if(arraste.modo==='girar'){
        const r={...rotacaoDaUnidade(arraste.u)},passo=gestoRef.current.encaixe?15:0.5,delta=e.clientX-inicio.x;
        r[arraste.eixo]=(((r[arraste.eixo]+Math.round(delta*0.5/passo)*passo+180)%360+360)%360)-180;
        aplicarPrevia(girarVolumeNoCentro(arraste.u,r));return;
      }
      ponteiro(e);const p=ray.ray.intersectPlane(arraste.plano,new THREE.Vector3());if(!p)return;
      const d=p.sub(arraste.ponto).multiplyScalar(1000);
      aplicarPrevia(posicaoDoArraste(arraste.u,d,V,arraste.modo,gestoRef.current.encaixe?50:0,false));
    };
    const aoSoltar=(e)=>{
      if(arraste){if(e.pointerId===arraste.pointerId){e.preventDefault();e.stopPropagation();finalizar();}return;}
      if(!selecionarRef.current||!inicio||Math.hypot(e.clientX-inicio.x,e.clientY-inicio.y)>6)return;
      const hit=encontrar(e);if(hit)selecionarRef.current(hit.g.userData.u.id);inicio=null;
    };
    const cancelarPonteiro=()=>finalizar(true);
    const tecla=(e)=>{if(e.key==='Escape'&&arraste){e.preventDefault();e.stopPropagation();finalizar(true);}};
    renderer.domElement.addEventListener('pointerdown',aoPressionar,true);renderer.domElement.addEventListener('pointermove',aoMover,true);renderer.domElement.addEventListener('pointerup',aoSoltar,true);renderer.domElement.addEventListener('pointercancel',cancelarPonteiro);renderer.domElement.addEventListener('lostpointercapture',cancelarPonteiro);window.addEventListener('keydown',tecla,true);
    st.current = { cancelarArraste:()=>finalizar(true),atualizar:true,unidades,selecionador,renderer, scene, camera, controls, enquadrar, mostrarPasso, rotular, rotulos: true, vivo: true };
    controls.enabled=true;
    enquadrar("iso");
    if(cameraAnterior.current?.chave===chaveCamera){camera.position.copy(cameraAnterior.current.posicao);controls.target.copy(cameraAnterior.current.alvo);st.current.vista=cameraAnterior.current.vista||"iso";setVista(st.current.vista);controls.update();}
    mostrarPasso(carga.passos.length - 1);
    // A carga é estática: só redesenha quando a câmera ou a montagem muda.
    let quadro;const loop = () => { const mudou=controls.update();if(mudou||st.current?.atualizar){renderer.render(scene,camera);if(st.current)st.current.atualizar=false;}quadro=requestAnimationFrame(loop); };loop();
    let ultimaLargura=W,ultimaAltura=H;
    const onResize = () => { const w = el.clientWidth || W, h = el.clientHeight || H;if(w===ultimaLargura&&h===ultimaAltura)return;ultimaLargura=w;ultimaAltura=h; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); if(st.current)st.current.atualizar=true; };
    const observador = new ResizeObserver(onResize); observador.observe(el);
    return () => {
      cameraAnterior.current={chave:chaveCamera,vista:st.current?.vista,posicao:camera.position.clone(),alvo:controls.target.clone()};
      cancelAnimationFrame(quadro);observador.disconnect();controls.dispose();
      arraste=null;renderer.domElement.removeEventListener('pointerdown',aoPressionar,true);renderer.domElement.removeEventListener('pointermove',aoMover,true);renderer.domElement.removeEventListener('pointerup',aoSoltar,true);renderer.domElement.removeEventListener('pointercancel',cancelarPonteiro);renderer.domElement.removeEventListener('lostpointercapture',cancelarPonteiro);window.removeEventListener('keydown',tecla,true);
      scene.traverse(o=>{o.geometry?.dispose?.();const mats=[o.material,o.userData.matOrig].flat().filter(Boolean);for(const m of new Set(mats))if(m!==MATERIAL_CINZA)m.dispose?.();});
      scene.environment?.dispose();pm.dispose();renderer.dispose();el.removeChild(renderer.domElement);st.current=null;
    };
  }, [carga, malhas, madeira, altura]);

  useEffect(()=>{const s=st.current;if(!s)return;s.cancelarArraste();s.controls.enabled=true;s.renderer.domElement.style.cursor=onAlterarMontagem&&modo!=='camera'?'grab':'auto';},[modo,!!onAlterarMontagem]);
  useEffect(()=>{const s=st.current;if(!s)return;const g=s.unidades.find(u=>u.userData.u.id===volumeSelecionado);s.selecionador.visible=!!g;s.atualizar=true;if(g)s.selecionador.setFromObject(g);},[volumeSelecionado,carga,malhas]);
  useEffect(() => { setPasso(carga ? carga.passos.length - 1 : -1); }, [carga]);
  useEffect(() => { if (st.current) { st.current.rotulos = rotulos; st.current.mostrarPasso(passo); } }, [passo, rotulos]);

  useImperativeHandle(apiRef || ref, () => ({
    /** Imagem PNG (data URL) da carga: vista iso|lado|topo|tras, opcionalmente só até a camada `ci` com as anteriores em cinza. */
    capturar(vista = "iso", ci = null, passoFinal = null) {
      const s = st.current; if (!s) return null;
      // tamanho fixo e pixelRatio 1: o PDF vai por upload e o corpo tem teto (~600 KB por imagem)
      const el = s.renderer.domElement, W0 = el.clientWidth, H0 = el.clientHeight, pr = s.renderer.getPixelRatio();
      const capturaW = 1600, capturaH = vista === "iso" || vista === "tras" ? 960 : 480;
      s.renderer.setPixelRatio(1); s.renderer.setSize(capturaW, capturaH, false); s.camera.aspect = capturaW / capturaH; s.camera.updateProjectionMatrix();
      const selecaoVisivel=s.selecionador.visible;s.selecionador.visible=false;
      s.rotulos = true; s.tamRotulo = 0.075;
      if(passoFinal != null)s.mostrarPasso(passoFinal,null,carga.passos[passoFinal]);
      else if (ci == null) s.mostrarPasso(carga.passos.length - 1); else { const byId = new Map(carga.itens.map((u) => [u.id, u])); let k = -1; carga.passos.forEach((id, i) => { if ((byId.get(id)?.camada || 0) === ci) k = i; }); s.mostrarPasso(k, ci); }
      s.enquadrar(vista); s.renderer.render(s.scene, s.camera);
      const url = el.toDataURL("image/jpeg", 0.8);
      s.renderer.setPixelRatio(pr); s.renderer.setSize(W0, H0); s.camera.aspect = W0 / H0; s.camera.updateProjectionMatrix();
      s.rotulos = rotulos; s.tamRotulo = 0.05; s.mostrarPasso(passo); s.enquadrar("iso");s.selecionador.visible=selecaoVisivel; return url;
    },
    /** Foto (JPEG data URL) de UM volume sozinho, em isométrica, com a embalagem dele — o desenho de referência do cartão no PDF. */
    capturarVolume(uId, W = 640, H = 400) {
      const s = st.current, u = carga?.itens?.find((i) => i.id === uId); if (!s || !u) return null;
      const cena = new THREE.Scene(); cena.background = new THREE.Color(0xffffff); cena.environment = s.scene.environment;
      cena.add(new THREE.HemisphereLight(0xffffff, 0x8d99a6, 0.7)); const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(-3, 6, 4); cena.add(sol);
      const g = montarUnidade({ ...u, x: 0, y: 0, z: 0 }, malhas); cena.add(g);
      const bounds=new THREE.Box3().setFromObject(g),centro=bounds.getCenter(new THREE.Vector3()),raio=bounds.getSize(new THREE.Vector3()).length()/2;
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

  const escolhido=carga?.itens.find(u=>u.id===volumeSelecionado);
  const giroRapido=(eixo)=>{if(!escolhido||!onAlterarMontagem)return;const r={...rotacaoDaUnidade(escolhido)};r[eixo]=(r[eixo]+90)%360;onAlterarMontagem(recalcularMontagem({...carga,itens:carga.itens.map(u=>u.id===escolhido.id?girarVolumeNoCentro(u,r):u)},madeira));};
  const aproximar=(fator)=>{const s=st.current;if(!s)return;s.camera.position.sub(s.controls.target).multiplyScalar(fator).add(s.controls.target);s.controls.update();s.atualizar=true;};
  const focar=()=>{const s=st.current,g=s?.unidades.find(g=>g.userData.u.id===volumeSelecionado);if(!g)return;const dir=s.camera.position.clone().sub(s.controls.target).normalize();s.controls.target.copy(enquadrarCameraCarga(s.camera,new THREE.Box3().setFromObject(g),dir));s.controls.update();s.atualizar=true;};
  const n = carga?.passos?.length || 0, fim = passo >= n - 1, u = passo >= 0 && !fim ? carga.itens.find((x) => x.id === carga.passos[passo]) : null;
  const btn = "min-w-11 min-h-11 px-3 rounded-lg border border-slate-200 bg-white text-torg-dark hover:bg-slate-50 disabled:opacity-35 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-torg-blue";
  return (
    <section className={`border border-slate-200 overflow-hidden bg-[#eef2f6] min-w-0 ${preencher?"h-full min-h-0 flex flex-col":"rounded-2xl shadow-sm"}`}>
      <div className="p-2 bg-white border-b border-slate-100 flex flex-wrap items-center gap-2 shrink-0">
        <h3 className={`${preencher?"hidden lg:inline-flex":"flex-1 inline-flex"} text-base font-bold text-torg-dark inline-flex items-center gap-2`}><Box size={19} className="text-torg-blue" /> Disposição da carga</h3>
        <div className="flex items-center gap-1 w-full sm:w-auto sm:ml-auto">
          <select aria-label="Vista do caminhão" value={vista} onChange={e=>st.current?.enquadrar(e.target.value)} className="sm:hidden min-w-0 flex-1 h-11 rounded-lg border px-1 text-xs"><option value="iso">Vista 3D</option><option value="lado">Lateral</option><option value="topo">De cima</option><option value="tras">Por trás</option></select>
          {["iso", "lado", "topo", "tras"].map((v) => <button key={v} className={`${btn} text-xs hidden sm:inline-flex`} onClick={() => st.current?.enquadrar(v)}>{{ iso: "3D", lado: "Lateral", topo: "Cima", tras: "Trás" }[v]}</button>)}
          <button className={btn} onClick={()=>aproximar(0.8)} aria-label="Aproximar" title="Aproximar"><ZoomIn size={17}/></button>
          <button className={btn} onClick={()=>aproximar(1.25)} aria-label="Afastar" title="Afastar"><ZoomOut size={17}/></button>
          {onAlterarMontagem&&<button className={btn} onClick={focar} disabled={!escolhido} aria-label="Focar volume selecionado" title="Focar volume selecionado"><Focus size={17}/></button>}
          <button className={`${btn} ${rotulos ? "border-torg-blue text-torg-blue bg-torg-blue-50" : ""}`} onClick={() => setRotulos((r) => !r)} title="Números dos volumes" aria-label="Números dos volumes" aria-pressed={rotulos}><Tag size={17} /></button>
        </div>
      </div>
      {onAlterarMontagem && <div className="p-2 border-b border-slate-200 bg-white space-y-1 shrink-0">
        <div className="flex gap-1" role="group" aria-label="Modo de ajuste no 3D">{[['mover','Mover',Move],['altura','Altura',MoveVertical],['girar','Girar peça',RotateCw],['camera','Navegar',Move]].map(([m,n,Icon])=><button key={m} type="button" aria-pressed={modo===m} onClick={()=>{setModo(m);if(m==='altura')st.current?.enquadrar('lado');}} className={`${btn} flex-1 sm:flex-none text-xs gap-1 px-2 ${modo===m?'border-torg-blue text-torg-blue bg-blue-50 font-bold':''}`}><Icon size={15}/>{n}</button>)}
        </div>
        <div className="flex items-center gap-3 min-h-8 flex-wrap">
          {modo==='girar'&&<label className="text-xs text-torg-dark">Eixo <select aria-label="Eixo de rotação" value={eixo} onChange={e=>setEixo(e.target.value)} className="h-8 border rounded px-1"><option value="y">Vertical · virar</option><option value="x">Comprimento · deitar</option><option value="z">Largura · inclinar</option></select></label>}
          <label className="flex items-center gap-1 text-xs text-torg-gray"><input type="checkbox" checked={encaixe} onChange={e=>setEncaixe(e.target.checked)} className="h-4 w-4 accent-torg-blue"/>Encaixe {modo==='girar'?'15°':'5 cm'}</label>
          {!preencher&&<button type="button" disabled={!podeDesfazer||!!movimento} onClick={onDesfazer} className="text-xs text-torg-blue min-h-8">Desfazer movimento</button>}
          {modo==='girar'&&<button type="button" disabled={!escolhido||!!movimento} onClick={()=>giroRapido(eixo)} className="text-xs text-torg-blue min-h-8">Girar +90°</button>}
        </div>
      </div>}
      <div className={preencher?'relative flex-1 min-h-0':'relative'}>
        <div ref={host} style={preencher?{height:'100%'}:{height:`clamp(280px, 48dvh, ${altura}px)`}} className="w-full overflow-hidden [&_canvas]:block" />
        {onAlterarMontagem&&<p role="status" className={`absolute bottom-2 left-2 right-2 rounded-lg bg-white/90 p-2 text-xs pointer-events-none ${movimento?.colisao?'text-red-700':'text-torg-gray'}`}>{movimento?`Volume ${movimento.volume} · ${movimento.rotacao?`giro ${movimento.rotacao[gestoRef.current.eixo]}°`:`frente ${(movimento.x/10).toFixed(0)} · lateral ${(movimento.z/10).toFixed(0)} · altura ${(movimento.y/10).toFixed(0)} cm`}${movimento.colisao?' · Possível sobreposição':''}`:modo==='girar'?'Arraste a peça para girar no eixo escolhido. Esc cancela.':modo==='altura'?'Arraste a peça para cima ou para baixo. Esc cancela.':modo==='camera'?'Arraste para girar a vista. Use a rolagem para aproximar.':'Arraste a peça livremente. Arraste o fundo para girar a vista; rolagem aproxima.'}</p>}
      </div>
      {!onAlterarMontagem&&<p className="text-[11px] text-torg-gray px-4 pb-3">Arraste para girar · use dois dedos ou a rolagem para aproximar</p>}
      {!onAlterarMontagem&&<div className="p-4 bg-white border-t border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Sequência de carregamento</p><p className="text-sm font-bold text-torg-dark mt-1" aria-live="polite">{fim ? `Carga completa · ${n} volumes` : passo < 0 ? "Veículo vazio" : `Volume ${u?.volume} · passo ${passo + 1} de ${n}`}</p></div>
          <div className="flex items-center gap-2">
            <button className={btn} onClick={() => setPasso(-1)} disabled={!!onAlterarMontagem || passo < 0} title="Caçamba vazia" aria-label="Caçamba vazia"><ChevronsLeft size={18} /></button>
            <button className={btn} onClick={() => setPasso((p) => Math.max(-1, p - 1))} disabled={!!onAlterarMontagem || passo < 0} title="Volume anterior" aria-label="Volume anterior"><ChevronLeft size={18} /></button>
            <button className={`${btn} flex-1 sm:flex-none gap-1.5`} onClick={() => setPasso((p) => Math.min(n - 1, p + 1))} disabled={!!onAlterarMontagem || fim} aria-label="Próximo volume"><span className="text-sm font-semibold">Próximo</span><ChevronRight size={18} /></button>
            <button className={btn} onClick={() => setPasso(n - 1)} disabled={!!onAlterarMontagem || fim} title="Carga completa" aria-label="Carga completa"><ChevronsRight size={18} /></button>
          </div>
        </div>
        <label className="block"><span className="sr-only">Etapa do carregamento</span><input type="range" min={-1} max={Math.max(-1, n - 1)} value={passo} onChange={(e) => setPasso(Number(e.target.value))} disabled={!!onAlterarMontagem || !n} className="w-full h-6 accent-torg-blue cursor-pointer" /></label>
        {u && <p className="text-xs text-torg-gray leading-relaxed">{u.rotulo} · {Math.round(u.kg || 0).toLocaleString("pt-BR")} kg · {u.C} × {u.L} × {u.A} mm · a {((u.x || 0) / 1000).toFixed(1).replace(".", ",")} m da frente{u.girada ? " · atravessado" : ""}</p>}
      </div>}
    </section>
  );
});
export default VisualizadorCarga;
