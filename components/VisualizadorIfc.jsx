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
export default function VisualizadorIfc({ url, onSelecionar, cores, selecionada, altura = 520, modo = "modelo" }) {
  const box = useRef(null);
  const ref = useRef({});             // guarda three/api entre renders sem provocar re-render
  const [estado, setEstado] = useState({ fase: "carregando", pct: 0 });
  const [info, setInfo] = useState(null);
  const [pronto, setPronto] = useState(false);

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
        // ⚠ `preserveDrawingBuffer` permite ler o canvas depois de desenhado — é o que torna possível
        // salvar a vista como imagem (e foi como conferi a tela sem conseguir autenticar). Custa um
        // pouco de memória de vídeo; numa cena deste porte é irrelevante.
        const rend = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
        // ⚠⚠ ESPAÇO DE COR. As cores do IFC são sRGB; sem declarar isso, o three interpreta como
        // linear e tudo sai lavado — o azul da viga vira azul-claro, o marrom do piso vira bege. Era
        // parte do que fazia a imagem parecer "menos limpa" que a do Trimble.
        rend.outputColorSpace = THREE.SRGBColorSpace;
        rend.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.innerHTML = "";
        el.appendChild(rend.domElement);
        rend.setSize(el.clientWidth || 800, altura);
        // ⚠⚠ ILUMINAÇÃO DE CAD, NÃO DE CENA. Vitor (03/09/2026): "não tem a mesma visão que tem no
        // Trimble Connect, é muito mais detalhado". Luz ambiente chapada some com o relevo: aba de
        // perfil, alma e enrijecedor ficam do mesmo tom e a peça vira um borrão. A hemisférica dá
        // céu claro e chão escuro — é ela que faz a face de cima ler diferente da de baixo —, e as
        // duas direcionais cruzadas revelam a face que ficaria preta.
        cena.add(new THREE.HemisphereLight(0xffffff, 0xb8c4cf, 0.95));
        const sol = new THREE.DirectionalLight(0xffffff, 0.75); sol.position.set(1, 2, 1.4); cena.add(sol);
        const sol2 = new THREE.DirectionalLight(0xffffff, 0.35); sol2.position.set(-1.2, 0.6, -1); cena.add(sol2);
        const sol3 = new THREE.DirectionalLight(0xffffff, 0.2); sol3.position.set(0, -1, 0.4); cena.add(sol3);

        // ── malha: uma por MARCA, para pintar e destacar por conjunto ──
        setEstado({ fase: "montando", pct: 0 });
        // ⚠⚠ AS CORES SÃO DO MODELO, NÃO MINHAS. Vitor (03/09/2026) mandou o print do MESMO arquivo
        // no Trimble: viga azul, treliça amarela, pilar laranja, piso rosa. Eu pintava tudo de
        // cinza e era essa a diferença que ele lia como "muito mais detalhado" — a cor separa o que
        // a forma sozinha não separa, e ela já vem no IFC (1.630 IFCSTYLEDITEM neste arquivo).
        //
        // ⚠ Agrupa por MARCA + COR: um conjunto tem peças de cores diferentes (a treliça amarela
        // com a chapa de ligação azul), e juntar tudo numa malha só apagaria isso. O clique continua
        // devolvendo a marca — quem responde é o `userData`, não a malha.
        const porChave = new Map();    // "marca|cor" → { marca, cor, gs: [] }
        let n = 0;
        api.StreamAllMeshes(modelID, (mesh) => {
          const marca = marcaDe.get(mesh.expressID) || null;
          const g = mesh.geometries;
          for (let i = 0; i < g.size(); i++) {
            const p = g.get(i);
            const c = p.color;
            // cor do IFC em 0..1; sem cor (raro) cai no cinza padrão
            const hex = c && (c.x + c.y + c.z) > 0
              ? (Math.round(c.x * 255) << 16) | (Math.round(c.y * 255) << 8) | Math.round(c.z * 255)
              : COR_PADRAO;
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
            const chave = `${marca || "__sem_marca__"}|${hex}`;
            const grupo = porChave.get(chave) || porChave.set(chave, { marca, hex, gs: [] }).get(chave);
            grupo.gs.push(bg);
            n++;
          }
        });

        // ⚠ junta as geometrias de cada marca numa malha só: 1.500 objetos separados derrubam o
        // quadro por causa das chamadas de desenho; por marca dá algumas centenas.
        const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
        const malhas = new Map();     // chave → mesh
        const arestasCruas = [];
        for (const [chave, { marca, hex, gs }] of porChave) {
          const junta = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
          if (!junta) continue;
          // ⚠ no modo "andamento" a cor do estado substitui a do modelo; no modo "modelo" vale o IFC
          const doEstado = cores?.[marca];
          const cor = new THREE.Color(modo === "andamento" && doEstado ? doEstado : hex);
          // ⚠ Phong com brilho baixo em vez de Lambert: o realce especular é o que dá a leitura de
          // metal e separa a mesa da alma num perfil. Sem ele o aço parece papel.
          // ⚠⚠ NÃO CONVERTER A COR À MÃO. O three já trata `new THREE.Color(hex)` como sRGB e
          // converte sozinho (ColorManagement ligado por padrão). Um `convertSRGBToLinear()` aqui
          // converte DUAS vezes: medido — o piso marrom da OP-089 virou vermelho-escuro e a obra
          // inteira ficou pesada. O que faltava era só declarar o espaço de saída do renderizador.
          const mat = new THREE.MeshPhongMaterial({ color: cor, shininess: 14, specular: 0x1e2833, side: THREE.DoubleSide, flatShading: false });
          const m = new THREE.Mesh(junta, mat);
          m.userData.marca = marca || null;
          m.userData.hex = hex;
          cena.add(m); malhas.set(chave, m);

          // ⚠⚠ AS ARESTAS SÃO O QUE SEPARA UMA PEÇA DA VIZINHA. Limiar de 25°: abaixo disso a
          // aresta é curvatura de tubo e desenhá-la encheria a tela de risco.
          // ⚠ COLETA AGORA, DESENHA NUMA MALHA SÓ DEPOIS. Uma LineSegments por conjunto seriam ~600
          // chamadas de desenho a mais — junto com as 600 dos sólidos, é isso que faz o giro
          // engasgar. Aresta não precisa de identidade própria: ela não é clicável nem pintada.
          try { arestasCruas.push(new THREE.EdgesGeometry(junta, 25)); }
          catch { /* peça sem geometria de aresta: segue sem contorno */ }
          gs.forEach((g2) => { if (g2 !== junta) g2.dispose(); });
        }
        // uma única malha de arestas para a obra inteira
        let malhaArestas = null;
        if (arestasCruas.length) {
          const juntas = arestasCruas.length === 1 ? arestasCruas[0] : mergeGeometries(arestasCruas, false);
          if (juntas) {
            malhaArestas = new THREE.LineSegments(juntas, new THREE.LineBasicMaterial({ color: 0x243343, transparent: true, opacity: 0.38 }));
            malhaArestas.raycast = () => {};
            cena.add(malhaArestas);
          }
          arestasCruas.forEach((g2) => { if (g2 !== juntas) g2.dispose(); });
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
        ctrl.target.copy(centro);
        // ⚠⚠ O QUE FAZ A NAVEGAÇÃO PARECER A DO TEKLA. Vitor (03/09/2026): "no Tekla é muito mais
        // fluida (…) você percebeu a navegação, precisamos deixar da mesma maneira".
        //
        // `zoomToCursor` é o maior de todos: no Tekla a roda aproxima do ponto onde está o cursor,
        // não do centro da obra. Sem isso, aproximar de um detalhe vira uma sequência de zoom +
        // arrasto + zoom — e é exatamente essa briga que se sente como travamento.
        ctrl.zoomToCursor = true;
        ctrl.enableDamping = true;
        ctrl.dampingFactor = 0.09;      // inércia curta: acompanha a mão sem parecer escorregadia
        ctrl.rotateSpeed = 0.65;        // padrão gira rápido demais num modelo deste tamanho
        ctrl.zoomSpeed = 0.9;
        ctrl.panSpeed = 0.85;
        ctrl.screenSpacePanning = true; // arrastar move no plano da tela, como no Tekla
        ctrl.maxPolarAngle = Math.PI;   // deixa passar por baixo da obra
        ctrl.update();

        // ⚠⚠ VISTAS PADRÃO E ZOOM SÃO CONVENÇÃO, NÃO ENFEITE. O print do Trimble que o Vitor mandou
        // tem a roseta de navegação e o cursor de zoom no canto — quem trabalha com modelo procura
        // esses controles por reflexo, e sem eles a única saída é arrastar até acertar.
        //
        // ⚠ enquadra pela ESFERA envolvente e pelo campo de visão: distância fixa deixa obra
        // comprida cortada e obra pequena num ponto.
        const irPara = (dirArr, alvo) => {
          const cx2 = new THREE.Box3().setFromObject(cena);
          const c2 = alvo || cx2.getCenter(new THREE.Vector3());
          const r2 = (alvo ? raio * 0.18 : cx2.getSize(new THREE.Vector3()).length() / 2) || 5;
          const d2 = (r2 / Math.sin((cam.fov * Math.PI / 180) / 2)) * 1.15;
          cam.position.copy(c2).addScaledVector(new THREE.Vector3(...dirArr).normalize(), d2);
          ctrl.target.copy(c2); cam.updateProjectionMatrix(); ctrl.update();
        };
        const zoom = (f) => {
          const v = new THREE.Vector3().subVectors(cam.position, ctrl.target);
          v.multiplyScalar(f); cam.position.copy(ctrl.target).add(v); ctrl.update();
        };
        // ⚠ enquadrar NA SELEÇÃO: é o gesto mais pedido num modelo grande — achar a peça que a
        // lista apontou sem caçar com o mouse.
        const focar = (marcaAlvo) => {
          const alvos = [...malhas.values()].filter((m) => m.userData.marca === marcaAlvo);
          if (!alvos.length) return;
          const cx3 = new THREE.Box3();
          for (const m of alvos) cx3.expandByObject(m);
          const c3 = cx3.getCenter(new THREE.Vector3());
          const r3 = Math.max(0.4, cx3.getSize(new THREE.Vector3()).length() / 2);
          const d3 = (r3 / Math.sin((cam.fov * Math.PI / 180) / 2)) * 2.2;
          const dir3 = new THREE.Vector3().subVectors(cam.position, ctrl.target).normalize();
          cam.position.copy(c3).addScaledVector(dir3, d3);
          ctrl.target.copy(c3); ctrl.update();
        };

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

        // ⚠⚠ DESENHA SÓ QUANDO MUDA. Redesenhar 60 vezes por segundo uma cena parada é queimar GPU
        // à toa — e, num laptop, é o que faz o ventilador subir e o quadro cair justamente quando a
        // pessoa começa a girar. Com damping ligado o `update()` devolve `true` enquanto a inércia
        // corre, então o laço acompanha o movimento e dorme depois.
        let raf = 0, forcar = true;
        const anima = () => {
          raf = requestAnimationFrame(anima);
          const mexeu = ctrl.update();
          if (mexeu || forcar) { rend.render(cena, cam); forcar = false; }
        };
        const pedirQuadro = () => { forcar = true; };
        ctrl.addEventListener("change", pedirQuadro);
        anima();

        ref.current = { THREE, cena, malhas, rend, cam, ctrl, irPara, zoom, focar, centro, pedirQuadro };
        setPronto(true);
        setInfo({ conjuntos: total, malhas: malhas.size, geometrias: n });
        setEstado({ fase: "pronto" });

        limpar = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", medir);
          rend.domElement.removeEventListener("pointerdown", down);
          rend.domElement.removeEventListener("pointermove", move);
          rend.domElement.removeEventListener("pointerup", up);
          ctrl.removeEventListener("change", pedirQuadro);
          ctrl.dispose();
          for (const m of malhas.values()) { m.geometry.dispose(); m.material.dispose(); }
          if (malhaArestas) { malhaArestas.geometry.dispose(); malhaArestas.material.dispose(); }
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
    for (const [, m] of malhas) {
      const marca = m.userData.marca;
      const doEstado = cores?.[marca];
      const base = modo === "andamento" && doEstado ? doEstado : m.userData.hex;
      m.material.color.set(marca && marca === selecionada ? COR_SEL : base);
    }
    ref.current.pedirQuadro?.();
  }, [selecionada, cores, modo]);

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
        <div className="absolute left-3 top-3 text-[10.5px] font-semibold text-torg-gray bg-gray-50/90 border border-gray-200 rounded px-2 py-1">
          {info.conjuntos} conjuntos · {info.geometrias} peças
        </div>
      )}

      {/* ⚠ controles no canto, sobre a cena — é onde quem usa modelo procura por reflexo */}
      {pronto && (
        <>
          <div className="absolute right-3 top-3 flex flex-col gap-1 items-end">
            <div className="flex gap-0.5 bg-white/95 border border-gray-200 rounded-lg p-0.5 shadow-sm">
              {[["iso", "Isométrica", [0.72, 0.48, 0.72]], ["frente", "Frente", [0, 0, 1]],
                ["lado", "Lateral", [1, 0, 0]], ["topo", "Topo", [0, 1, 0.001]]].map(([k, t, dir]) => (
                <button key={k} title={t} onClick={() => ref.current?.irPara?.(dir)}
                  className="text-[10.5px] font-semibold px-2 py-1 rounded text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue">
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-0.5 bg-white/95 border border-gray-200 rounded-lg p-0.5 shadow-sm">
              <button title="Enquadrar tudo" onClick={() => ref.current?.irPara?.([0.72, 0.48, 0.72])}
                className="text-[10.5px] font-semibold px-2 py-1 rounded text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue">enquadrar</button>
              <button title="Aproximar da peça selecionada" onClick={() => selecionada && ref.current?.focar?.(selecionada)}
                disabled={!selecionada}
                className="text-[10.5px] font-semibold px-2 py-1 rounded text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue disabled:opacity-35">ir até a peça</button>
            </div>
          </div>
          <div className="absolute right-3 bottom-3 flex flex-col bg-white/95 border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <button title="Aproximar" onClick={() => ref.current?.zoom?.(0.75)} className="px-2.5 py-1 text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue text-[15px] leading-none">+</button>
            <button title="Afastar" onClick={() => ref.current?.zoom?.(1.35)} className="px-2.5 py-1 text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue text-[15px] leading-none border-t border-gray-200">−</button>
          </div>
        </>
      )}
    </div>
  );
}
