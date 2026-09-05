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
import { Maximize2, Minimize2, Loader2 } from "lucide-react";
import { log } from "@/lib/log";

const registro = log("VisualizadorIfc");

// ⚠⚠ O NAVEGADOR PRECISA RESPIRAR. Vitor (03/09/2026): "a página para carregar o modelo IFC trava
// algumas vezes e tenho que colocar em aguardar, pois aparece que a página está sem resposta".
// Estava tudo numa tacada só na linha principal: ler o IFC, converter 13.874 peças em geometria e
// juntar tudo. Enquanto isso o navegador não processa nem o próprio relógio, e a partir de uns
// poucos segundos ele conclui que a aba morreu.
//
// `pausa()` devolve o controle ao navegador entre os lotes. O tempo TOTAL até abrir é praticamente
// o mesmo; o que muda é que a aba continua viva, a barra de progresso anda e ninguém precisa
// escolher "aguardar" num aviso de página travada.
const pausa = () => new Promise((r) => setTimeout(r, 0));
const LOTE = 250;

const COR_PADRAO = 0x9fb0bf;
const COR_SEL = 0xf4801f;

// ⚠⚠ QUANDO O ARQUIVO NÃO TRAZ COR. Vitor (03/09/2026): "abri o modelo 3D da 118 e ele apareceu
// cinza". E está mesmo: aquele IFC saiu no formato AISC, com ZERO IFCSTYLEDITEM e ZERO
// IFCCOLOURRGB — não é o portal que perdeu a cor, é o arquivo que não tem nenhuma. Obra inteira
// cinza não se lê: não dá para separar pilar de viga, nem enxergar o contravento no meio do pórtico.
// Nesse caso o portal pinta por TIPO, que é informação que todo IFC tem (vem da entidade) e é a
// mesma leitura que o Tekla dá por classe.
const COR_TIPO = {
  Pilar: 0x2e7d5b, Viga: 0x3d6fa5, Barra: 0x8a6bb0, Chapa: 0xc19a2b,
  "Guarda-corpo": 0xc4682e, Escada: 0x6d8496, Piso: 0xa8b3bd, Parafuso: 0x5b6b7a,
};

/**
 * @param {string} url      de onde baixar o IFC (rota do portal)
 * @param {(item:object|null)=>void} onSelecionar  o item do índice clicado (conjunto ou parafuso)
 * @param {(dados:{indice:object[],niveis:object[]})=>void} [onIndice]  o que o modelo tem dentro
 * @param {Set<string>|null} [visiveis]    itens em foco; o resto fica translúcido (null = tudo)
 * @param {Set<string>} [ocultos]          itens que somem da cena (o "ocultar" da tela)
 * @param {boolean} [esconderResto]        em vez de apagar o que está fora do filtro, some com ele
 * @param {Record<string,string>} [cores]  marca → cor hex ("#0E7A5F"), para pintar por andamento
 * @param {string|null} [selecionada]      chave destacada de fora (a lista, por exemplo)
 */
export default function VisualizadorIfc({ url, onSelecionar, onIndice, visiveis, ocultos, esconderResto, cores, selecionada, altura = 520, modo = "modelo" }) {
  const box = useRef(null);
  const ref = useRef({});             // guarda three/api entre renders sem provocar re-render
  const [estado, setEstado] = useState({ fase: "carregando", pct: 0 });
  const [info, setInfo] = useState(null);
  const [pronto, setPronto] = useState(false);
  // ⚠⚠ TELA CHEIA DE VERDADE (API do navegador), não um "esconde a barra lateral". Vitor
  // (03/09/2026): "seria bom ter uma tela maior para navegar (…) uma opção para poder preencher a
  // tela toda". Num modelo de obra inteira, cada centímetro de tela é detalhe que se enxerga sem
  // aproximar — e sair do navegador inteiro dá 15% a mais de altura que nenhum ajuste de layout
  // consegue.
  const [cheia, setCheia] = useState(false);
  const caixa = useRef(null);

  // ⚠⚠ O QUE SE LÊ DO MODELO, TUDO NUMA PASSADA SÓ. São quatro perguntas diferentes e uma
  // varredura só do arquivo — refazer isso a cada clique travaria a tela:
  //   1. a MARCA do conjunto (Tag do IFCELEMENTASSEMBLY, via IFCRELAGGREGATES)
  //   2. o TIPO da peça (viga, chapa, parafuso… pelo tipo da entidade IFC)
  //   3. o NÍVEL (pset "Tekla Common" → "Bottom elevation", ex.: ' +4.382')
  //   4. o PARAFUSO inteiro (pset "Tekla Bolt": nome, norma, bitola, comprimento, porca, arruela
  //      e se aperta na obra ou na fábrica)
  // Medido no export do Tekla 2025 da OP-089: 148 conjuntos, 197 parafusos, 680 peças com nível.
  const PSETS = new Set(["Tekla Common", "Tekla Bolt", "Tekla Assembly"]);

  // ⚠ async por causa dos respiros: são três varreduras grandes (assemblies, property sets e as
  // ligações entre eles) e num modelo de porte a soma passa de dez segundos.
  const lerModelo = async (api, modelID, WebIFC, aoAndar) => {
    const val = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
    const marcaDe = new Map(), tipoDe = new Map(), nivelDe = new Map(), parafusoDe = new Map();
    // ⚠⚠ O CONJUNTO É O ASSEMBLY, NÃO A MARCA. Parecem a mesma coisa e não são: a mesma marca se
    // repete pela obra (e há modelo em que o Tekla exporta a marca vazia — no executivo da OP-089
    // TODOS os assemblies saíram como "V0"). Agrupando por marca, 148 conjuntos viraram 21 blocos,
    // cada clique acendia meia obra e o nível saía do primeiro pedaço que aparecesse.
    const asmDe = new Map();          // peça → expressID do conjunto
    const pesoDoAsm = new Map();      // conjunto → kg do modelo
    let total = 0;

    try {
      // ── 1. marca ──
      const marcaDoAsm = new Map();
      const conjuntos = new Set();     // TODO conjunto, tenha marca ou não
      const asms = api.GetLineIDsWithType(modelID, WebIFC.IFCELEMENTASSEMBLY);
      for (let i = 0; i < asms.size(); i++) {
        const id = asms.get(i);
        conjuntos.add(id);
        const tag = String(val(api.GetLine(modelID, id)?.Tag) || "").replace(/\(\?\)/g, "").trim();
        // ⚠⚠ MARCA VAZIA NÃO É MARCA. Quando a numeração ainda não rodou, o Tekla exporta a Tag como
        // "V0(?)", "S0(?)" ou "0(?)" — foi o caso do executivo da OP-089, com os 148 conjuntos
        // saindo como "V0". Tratar isso como marca faria a lista virar 98 linhas iguais e o portal
        // ir buscar na LPC uma marca que não existe. Marca de verdade tem número diferente de zero.
        if (tag && !/^[A-Za-z]*0*$/.test(tag)) marcaDoAsm.set(id, tag);
      }
      total = conjuntos.size;
      // ⚠⚠ O CONJUNTO EXISTE MESMO SEM MARCA, e ignorar isso quebrou a tela: quando o modelo sai do
      // Tekla sem numeração, pular os assemblies sem marca deixava TODA peça sem conjunto — as 2.950
      // viravam um item só. O clique acendia a obra inteira de laranja e o painel abria dizendo
      // "sem marca" para o modelo todo. Marca é um DADO do conjunto, não a razão dele existir.
      const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
      for (let i = 0; i < rels.size(); i++) {
        const l = api.GetLine(modelID, rels.get(i));
        const asm = l?.RelatingObject?.value;
        if (asm == null || !conjuntos.has(asm)) continue;
        const marca = marcaDoAsm.get(asm) || null;
        for (const f of l?.RelatedObjects || []) {
          if (f?.value == null) continue;
          if (marca) marcaDe.set(f.value, marca);
          asmDe.set(f.value, asm);
        }
      }
      for (const id of conjuntos) asmDe.set(id, id);
      for (const [id, m] of marcaDoAsm) marcaDe.set(id, m);

      // ── 2. tipo ──
      for (const [tipoIfc, rotulo] of [
        [WebIFC.IFCBEAM, "Viga"], [WebIFC.IFCCOLUMN, "Pilar"], [WebIFC.IFCPLATE, "Chapa"],
        [WebIFC.IFCMEMBER, "Barra"], [WebIFC.IFCSLAB, "Piso"], [WebIFC.IFCRAILING, "Guarda-corpo"],
        [WebIFC.IFCSTAIRFLIGHT, "Escada"], [WebIFC.IFCMECHANICALFASTENER, "Parafuso"],
        [WebIFC.IFCBUILDINGELEMENTPROXY, "Outros"],
      ]) {
        if (!tipoIfc) continue;
        const ids = api.GetLineIDsWithType(modelID, tipoIfc);
        for (let i = 0; i < ids.size(); i++) tipoDe.set(ids.get(i), rotulo);
      }

      // ── 3 e 4. os property sets do Tekla ──
      // ⚠ `true` no GetLine traz as propriedades já embutidas: uma chamada por conjunto de
      // propriedades em vez de uma por propriedade (aqui, 3.213 em vez de ~11.000).
      const conteudo = new Map();
      const psets = api.GetLineIDsWithType(modelID, WebIFC.IFCPROPERTYSET);
      for (let i = 0; i < psets.size(); i++) {
        if (i % 400 === 0) { aoAndar?.(Math.round((i / Math.max(1, psets.size())) * 60)); await pausa(); }
        const id = psets.get(i);
        const l = api.GetLine(modelID, id, true);
        const nome = val(l?.Name);
        if (!PSETS.has(nome)) continue;
        const p = {};
        for (const h of l?.HasProperties || []) {
          const k = val(h?.Name);
          if (k) p[k] = val(h?.NominalValue);
        }
        conteudo.set(id, { nome, p });
      }
      const liga = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
      const num = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
      for (let i = 0; i < liga.size(); i++) {
        if (i % 400 === 0) { aoAndar?.(60 + Math.round((i / Math.max(1, liga.size())) * 40)); await pausa(); }
        const l = api.GetLine(modelID, liga.get(i));
        const ps = conteudo.get(l?.RelatingPropertyDefinition?.value);
        if (!ps) continue;
        for (const o of l?.RelatedObjects || []) {
          const id = o?.value;
          if (id == null) continue;
          if (ps.nome === "Tekla Common") {
            const b = num(ps.p["Bottom elevation"]);
            if (b != null) nivelDe.set(id, b);
          } else if (ps.nome === "Tekla Bolt") {
            parafusoDe.set(id, {
              nome: String(ps.p["Bolt Name"] || "").trim() || "parafuso",
              norma: String(ps.p["Bolt standard"] || "").trim(),
              bitolaMm: num(ps.p["Bolt size"]),
              compMm: num(ps.p["Bolt length"]),
              furoMm: num(ps.p["Bolt hole diameter"]),
              porca: String(ps.p["Nut name"] || "").trim(),
              porcaTipo: String(ps.p["Nut type"] || "").trim(),
              arruela: String(ps.p["Washer name"] || "").trim(),
              arruelaTipo: String(ps.p["Washer type"] || "").trim(),
              // ⚠ "Location" no Tekla é ONDE O PARAFUSO APERTA: 'Obra' é montagem no campo,
              // 'Oficina'/'Workshop' é fábrica. É a informação que mais muda a vida de quem
              // separa material — e é por isso que ela entra na chave do agrupamento.
              local: String(ps.p["Location"] || "").trim(),
            });
          } else if (ps.nome === "Tekla Assembly") {
            // ⚠⚠ SÓ NO PRÓPRIO CONJUNTO. O Tekla amarra o pset "Tekla Assembly" a TODAS as peças do
            // conjunto, não só ao conjunto — somar por peça multiplicava o peso pelo número de
            // peças: a passarela da OP-089, de 1,5 t, aparecia com 186 t.
            const kg = num(ps.p["Assembly/Cast unit weight"]);
            if (kg != null && marcaDoAsm.has(id)) pesoDoAsm.set(id, kg);
          }
        }
      }
    } catch (e) {
      registro.erro("[ifc] falha ao ler o modelo:", e?.message);
    }
    return { marcaDe, asmDe, tipoDe, nivelDe, parafusoDe, pesoDoAsm, total };
  };

  // ⚠⚠ NÍVEL SAI DE AGRUPAMENTO, NÃO DE CAMPO PRONTO. O IFC do Tekla traz UM andar só
  // (IFCBUILDINGSTOREY = 1 na OP-089) — o que existe de verdade é a cota de base de cada peça, e
  // ela vem contínua: 125 valores distintos, de +0,05 a +4,76. Quem pergunta "que peças formam
  // aquele nível" está falando de patamar, não de milímetro: agrupo por vão de 70 cm, que é o que
  // separa piso de piso sem picar o mesmo estrado em cinco níveis.
  const agruparNiveis = (cotas, desloc = 0) => {
    const ord = [...new Set(cotas.filter((x) => x != null))].sort((a, b) => a - b);
    const juntar = (tol) => {
      const fx = [];
      for (const c of ord) {
        const ult = fx[fx.length - 1];
        if (ult && c - ult.min <= tol) ult.max = c;
        else fx.push({ min: c, max: c });
      }
      return fx;
    };
    // ⚠⚠ A FOLGA SE AJUSTA À OBRA. Com 70 cm fixos, a passarela da OP-089 (5 m de altura) dava 6
    // níveis — certo — mas a torre da OP-118 (20 m) dava 25, uma lista que ninguém percorre. Vou
    // afrouxando até caber em 12 patamares: é o mesmo raciocínio de quem olha a obra e enxerga
    // "o piso de baixo, o mezanino, a plataforma" em vez de milímetro.
    let faixas = juntar(0.7);
    for (const tol of [1.2, 2, 3, 4.5, 7, 12]) {
      if (faixas.length <= 12) break;
      faixas = juntar(tol);
    }
    return faixas.map((f, i) => {
      const v = f.min - desloc;
      return {
        chave: `n${i}`,
        rotulo: `Nível ${v >= 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} m`,
        min: f.min, max: f.max,
      };
    });
  };

  useEffect(() => {
    let vivo = true;
    let limpar = () => {};
    let limparInsistencia = () => {};
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
        const { marcaDe, asmDe, tipoDe, nivelDe, parafusoDe, pesoDoAsm, total } =
          await lerModelo(api, modelID, WebIFC, (pct) => setEstado({ fase: "lendo", pct }));

        // ── cena ──
        const el = box.current;
        const cena = new THREE.Scene();
        cena.background = new THREE.Color(0xffffff);   // Vitor pediu fundo branco
        // ⚠ 35° e não os 45° de praxe: lente mais fechada = menos distorção de perspectiva, que é o
        // que dá o aspecto "chapado" e limpo do Tekla. Com 45° a viga do fundo afunila e a obra
        // parece menor dentro do mesmo quadro.
        const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
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
        rend.setSize(el.clientWidth || 800, el.clientHeight || (typeof altura === "number" ? altura : 560));
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
        //
        // ⚠⚠ PARAFUSO É GRUPO À PARTE, e por especificação. Um parafuso não tem marca (não é peça
        // fabricada, é item comprado), então cairia todo no balaio "sem marca" e o clique não
        // saberia dizer qual é. Agrupando por especificação — nome, norma e onde aperta — o clique
        // responde "1/2\" x 1 1/2\" A325N, aperta na obra, são 37 nesta obra", que é a pergunta
        // real de quem está olhando a ligação.
        const porChave = new Map();    // chave → { marca, hex, tipo, parafuso, gs, ids, cotas }
        let n = 0;
        // ⚠⚠ "SEM COR" SE MEDE PELA VARIEDADE, NÃO PELO VALOR. Primeiro tentei olhar se a cor vinha
        // zerada e não funcionou: quando o IFC não tem estilo nenhum, o motor devolve UMA cor padrão
        // para tudo — cor existe, só que é sempre a mesma. Um modelo de verdade tem dezenas (o da
        // OP-089 tem viga verde, chapa roxa, corrimão amarelo). Uma cor só na obra inteira = arquivo
        // sem cor, e aí vale mais pintar por tipo.
        const tonsVistos = new Set();

        // ⚠⚠ A GEOMETRIA SÓ EXISTE DENTRO DO CALLBACK — e isso me custou uma tela branca. Para
        // não travar a aba, eu tinha passado a só ANOTAR as referências durante a varredura e a
        // converter depois, em lotes. O motor, porém, LIBERA a geometria conforme entrega: chamar
        // `GetGeometry` depois devolve vazio. O resultado era o pior tipo de defeito — 3.036 objetos
        // na cena, nenhum erro no console, e a caixa envolvente da obra inteira vindo vazia
        // (Infinity/-Infinity), com a câmera enquadrando o nada.
        //
        // A saída que serve às duas coisas: uma primeira passada BARATA só para colher os ids, e
        // depois `StreamMeshes` em lotes — a geometria é gerada e convertida dentro do callback de
        // cada lote (correto), com um respiro entre lotes (a aba continua viva).
        const ids = [];
        api.StreamAllMeshes(modelID, (mesh) => { ids.push(mesh.expressID); });

        setEstado({ fase: "montando", pct: 0 });
        for (let inicio = 0; inicio < ids.length; inicio += LOTE) {
          if (!vivo) return;
          setEstado({ fase: "montando", pct: Math.round((inicio / Math.max(1, ids.length)) * 100) });
          await pausa();
          const lote = ids.slice(inicio, inicio + LOTE);
          api.StreamMeshes(modelID, lote, (mesh) => {
            const eid = mesh.expressID;
            const g = mesh.geometries;
            for (let i = 0; i < g.size(); i++) {
              const p = g.get(i);
              const c = p.color;
              const geoId = p.geometryExpressID;
              const m = p.flatTransformation;
              const marca = marcaDe.get(eid) || null;
              const asm = asmDe.get(eid) ?? null;
              const parafuso = parafusoDe.get(eid) || null;
              const tipo = tipoDe.get(eid) || (parafuso ? "Parafuso" : "Peça");
              const cota = nivelDe.get(eid) ?? null;
              {
            // cor do IFC em 0..1; sem cor (raro) cai no cinza padrão
            const hex = c && (c.x + c.y + c.z) > 0
              ? (Math.round(c.x * 255) << 16) | (Math.round(c.y * 255) << 8) | Math.round(c.z * 255)
              : COR_PADRAO;
            if (tonsVistos.size < 8) tonsVistos.add(hex);
            const geo = api.GetGeometry(modelID, geoId);
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
            bg.applyMatrix4(new THREE.Matrix4().fromArray(m));
            // ⚠⚠ A COTA TAMBÉM SAI DA GEOMETRIA. O "Bottom elevation" só existe no export do Tekla
            // com os psets dele; o da OP-118 (formato AISC) não tem nenhum, e sem isto a obra
            // inteira ficaria num nível só. A altura do ponto mais baixo da peça responde a mesma
            // pergunta e existe em qualquer arquivo — é medida, não campo preenchido.
            bg.computeBoundingBox();
            const yMin = bg.boundingBox?.min?.y;
            geo.delete();
            // ⚠ o ITEM é o que a pessoa seleciona (um conjunto, ou um parafuso por especificação);
            // a CHAVE é a malha, que ainda separa por cor dentro do mesmo conjunto — é o que
            // preserva a treliça amarela com a chapa de ligação azul.
            const item = parafuso
              ? `pf|${parafuso.nome}|${parafuso.norma}|${parafuso.local}`
              : asm != null ? `a${asm}` : "solto";
            const chave = `${item}|${hex}`;
            const grupo = porChave.get(chave)
              || porChave.set(chave, { item, marca, hex, tipo, parafuso, asm, gs: [], ids: new Set(), cotas: [], alturas: [] }).get(chave);
            grupo.gs.push(bg);
            grupo.ids.add(eid);
            if (cota != null) grupo.cotas.push(cota);
            else if (Number.isFinite(yMin)) grupo.alturas.push(yMin);
            n++;
              }
            }
          });
        }

        // ⚠ junta as geometrias de cada marca numa malha só: 1.500 objetos separados derrubam o
        // quadro por causa das chamadas de desenho; por marca dá algumas centenas.
        const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
        const malhas = new Map();     // chave → mesh
        const arestasCruas = [];
        const porItem = new Map();
        const semCor = tonsVistos.size <= 1;
        // ⚠⚠ OBRA GRANDE NÃO LEVA CONTORNO. Vitor (03/09/2026): "continua branco e a página sai do
        // ar". A malha de arestas é o que mais pesa: para cada grupo o motor percorre todos os
        // triângulos procurando quinas, e o resultado é outra geometria do tamanho da primeira. Numa
        // passarela de 2.950 peças isso é barato e o desenho fica lindo; na caldeira da OP-118, com
        // 13.874 peças e 3.032 conjuntos, é o dobro de tudo em memória — e é aí que a aba morre.
        //
        // Acima do limite a obra abre sem contorno: perde um pouco de definição entre peças
        // encostadas e ABRE, que é o que importa. O limite é de geometrias, não de megabytes: é o
        // número que manda no custo.
        const TETO_ARESTAS = 6000;
        const comArestas = n <= TETO_ARESTAS;
        // ⚠ a junção é a segunda parte cara: mesclar geometrias e extrair as arestas de 3.000 grupos
        // leva segundos. Mesmo respiro, mesma barra andando.
        let feitos = 0;
        for (const [chave, { item, marca, hex, tipo, parafuso, asm, gs, ids, cotas, alturas }] of porChave) {
          if (!vivo) return;
          if (feitos % 60 === 0) {
            setEstado({ fase: "juntando", pct: Math.round((feitos / Math.max(1, porChave.size)) * 100) });
            await pausa();
          }
          feitos++;
          const junta = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
          if (!junta) continue;
          // ⚠ no modo "andamento" a cor do estado substitui a do modelo; no modo "modelo" vale o IFC
          const doEstado = cores?.[marca];
          const base = semCor ? COR_TIPO[tipo] ?? COR_PADRAO : hex;
          const cor = new THREE.Color(modo === "andamento" && doEstado ? doEstado : base);
          // ⚠ Phong com brilho baixo em vez de Lambert: o realce especular é o que dá a leitura de
          // metal e separa a mesa da alma num perfil. Sem ele o aço parece papel.
          // ⚠⚠ NÃO CONVERTER A COR À MÃO. O three já trata `new THREE.Color(hex)` como sRGB e
          // converte sozinho (ColorManagement ligado por padrão). Um `convertSRGBToLinear()` aqui
          // converte DUAS vezes: medido — o piso marrom da OP-089 virou vermelho-escuro e a obra
          // inteira ficou pesada. O que faltava era só declarar o espaço de saída do renderizador.
          const mat = new THREE.MeshPhongMaterial({ color: cor, shininess: 14, specular: 0x1e2833, side: THREE.DoubleSide, flatShading: false });
          const m = new THREE.Mesh(junta, mat);
          // ⚠⚠ PARAFUSO NÃO HERDA A MARCA DO CONJUNTO. Ele está dentro do assembly, então o mapa de
          // marcas responde "V0" para ele também — e aí a lista mostrava marca no lugar da bitola, o
          // peso do conjunto entrava como peso de parafuso (792 kg de parafuso!) e a cor de
          // andamento pintava o parafuso com o status da peça soldada.
          m.userData.marca = parafuso ? null : marca || null;
          m.userData.hex = base;
          m.userData.chave = chave;
          m.userData.item = item;
          cena.add(m); malhas.set(chave, m);

          const reg = porItem.get(item) || porItem.set(item, {
            id: item, marca: parafuso ? null : marca || null, tipo, parafuso,
            // ⚠ a cota do conjunto é a MENOR das peças dele: ele pertence ao nível em que apoia,
            // não ao ponto mais alto que alcança — senão um pilar que sobe do térreo ao mezanino
            // seria contado como peça do mezanino.
            // ⚠ conta de peça é por CONJUNTO de ids, não soma: a mesma peça aparece em duas
            // malhas quando tem duas cores, e somar contaria em dobro (197 parafusos viravam 374).
            cota: null, ids: new Set(),
            pesoKg: !parafuso && asm != null ? (pesoDoAsm.get(asm) ?? null) : null,
          }).get(item);
          for (const i2 of ids) reg.ids.add(i2);
          for (const c of cotas) reg.cota = reg.cota == null ? c : Math.min(reg.cota, c);
          if (!cotas.length) for (const h of alturas) reg.cota = reg.cota == null ? h : Math.min(reg.cota, h);

          // ⚠⚠ AS ARESTAS SÃO O QUE SEPARA UMA PEÇA DA VIZINHA. Limiar de 25°: abaixo disso a
          // aresta é curvatura de tubo e desenhá-la encheria a tela de risco.
          // ⚠ COLETA AGORA, DESENHA NUMA MALHA SÓ DEPOIS. Uma LineSegments por conjunto seriam ~600
          // chamadas de desenho a mais — junto com as 600 dos sólidos, é isso que faz o giro
          // engasgar. Aresta não precisa de identidade própria: ela não é clicável nem pintada.
          if (comArestas) {
            try { arestasCruas.push(new THREE.EdgesGeometry(junta, 25)); }
            catch { /* peça sem geometria de aresta: segue sem contorno */ }
          }
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

        // ── níveis ──
        // ⚠ fecha a conta NO PRÓPRIO objeto: o clique devolve o item que está no `porItem`, e uma
        // cópia aqui faria o painel receber um item sem `pecas` e sem `nivel`.
        const indice = [...porItem.values()];
        for (const x of indice) { x.pecas = x.ids.size; delete x.ids; }
        // ⚠⚠ COTA MEDIDA É RELATIVA, COTA DE PROJETO É ABSOLUTA. Quando a altura sai da geometria, o
        // zero é onde o motor pousou o modelo (na OP-118 isso dava "Nível −14,63 m", que não existe
        // em projeto nenhum). Aí o nível passa a contar do ponto mais baixo da obra para cima, que é
        // como se fala no chão de fábrica. Quando a cota vem do Tekla, ela É a de projeto e fica
        // como está.
        const cotas = indice.map((x) => x.cota).filter((x) => x != null);
        const desloc = nivelDe.size === 0 && cotas.length ? Math.min(...cotas) : 0;
        const niveis = agruparNiveis(indice.map((x) => x.cota), desloc);
        for (const it of indice) {
          it.nivel = it.cota == null ? null
            : (niveis.find((f) => it.cota >= f.min && it.cota <= f.max) || niveis[0])?.chave || null;
        }
        // ⚠ a cota da peça acompanha o deslocamento do nível: senão a lista mostrava "Pilar · −0,08"
        // logo abaixo do rótulo "Nível +0,00 m", que é o mesmo lugar com dois números.
        if (desloc) for (const it of indice) if (it.cota != null) it.cota -= desloc;

        // ── enquadra ──
        // ⚠ ENQUADRA PELA ESFERA QUE ENVOLVE A OBRA, não por um múltiplo do tamanho: a distância
        // certa depende do campo de visão da câmera, senão obra comprida sai cortada e obra
        // pequena fica um ponto no meio da tela.
        cam.aspect = (el.clientWidth || 800) / (el.clientHeight || (typeof altura === "number" ? altura : 560)); cam.updateProjectionMatrix();
        // ⚠⚠ ENQUADRA PELO QUE APARECE, NÃO PELA ESFERA. A esfera envolvente superestima muito numa
        // obra comprida e estreita — a passarela da OP-089 tem 24 m de vão e 3 de largura, e a
        // esfera trata as duas como 24. Resultado: a obra saía ocupando um terço da tela, com
        // margem vazia dos dois lados.
        //
        // Aqui a distância é ajustada olhando para onde os 8 cantos da caixa caem na tela (espaço
        // normalizado): duas voltas bastam para encostar a obra na borda com folga de 10%.
        const cx = new THREE.Box3().setFromObject(cena);
        const centro = cx.getCenter(new THREE.Vector3());
        const raio = cx.getSize(new THREE.Vector3()).length() / 2 || 5;
        const dir = new THREE.Vector3(0.72, 0.48, 0.72).normalize();
        const cantos = [];
        for (const x of [cx.min.x, cx.max.x]) for (const y of [cx.min.y, cx.max.y]) for (const z of [cx.min.z, cx.max.z]) cantos.push(new THREE.Vector3(x, y, z));
        let dist = (raio / Math.sin((cam.fov * Math.PI / 180) / 2)) * 1.15;
        cam.near = Math.max(0.05, raio / 800); cam.far = raio * 40;
        for (let volta = 0; volta < 2; volta++) {
          cam.position.copy(centro).addScaledVector(dir, dist);
          cam.lookAt(centro);
          cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
          let maior = 0;
          for (const c of cantos) {
            const p = c.clone().project(cam);
            maior = Math.max(maior, Math.abs(p.x), Math.abs(p.y));
          }
          if (maior > 0.01) dist *= maior / 0.94;   // 0.94 = um respiro só na borda
        }
        cam.position.copy(centro).addScaledVector(dir, dist);
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
        // ⚠ mesma conta do enquadramento inicial: vista trocada não pode encolher a obra.
        const irPara = (dirArr) => {
          const cx2 = new THREE.Box3().setFromObject(cena);
          const c2 = cx2.getCenter(new THREE.Vector3());
          const d = new THREE.Vector3(...dirArr).normalize();
          const cantos2 = [];
          for (const x of [cx2.min.x, cx2.max.x]) for (const y of [cx2.min.y, cx2.max.y]) for (const z of [cx2.min.z, cx2.max.z]) cantos2.push(new THREE.Vector3(x, y, z));
          let d2 = (cx2.getSize(new THREE.Vector3()).length() / 2 || 5) / Math.sin((cam.fov * Math.PI / 180) / 2) * 1.15;
          for (let v = 0; v < 2; v++) {
            cam.position.copy(c2).addScaledVector(d, d2);
            cam.lookAt(c2); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
            let maior = 0;
            for (const c of cantos2) { const p = c.clone().project(cam); maior = Math.max(maior, Math.abs(p.x), Math.abs(p.y)); }
            if (maior > 0.01) d2 *= maior / 0.94;
          }
          cam.position.copy(c2).addScaledVector(d, d2);
          ctrl.target.copy(c2); cam.updateProjectionMatrix(); ctrl.update(); forcar = true;
        };
        const zoom = (f) => {
          const v = new THREE.Vector3().subVectors(cam.position, ctrl.target);
          v.multiplyScalar(f); cam.position.copy(ctrl.target).add(v); ctrl.update(); forcar = true;
        };
        // ⚠ enquadrar NA SELEÇÃO: é o gesto mais pedido num modelo grande — achar a peça que a
        // lista apontou sem caçar com o mouse.
        const focar = (itemAlvo) => {
          const alvos = [...malhas.values()].filter((m) => m.userData.item === itemAlvo);
          if (!alvos.length) return;
          const cx3 = new THREE.Box3();
          for (const m of alvos) cx3.expandByObject(m);
          const c3 = cx3.getCenter(new THREE.Vector3());
          const r3 = Math.max(0.4, cx3.getSize(new THREE.Vector3()).length() / 2);
          const d3 = (r3 / Math.sin((cam.fov * Math.PI / 180) / 2)) * 2.2;
          const dir3 = new THREE.Vector3().subVectors(cam.position, ctrl.target).normalize();
          cam.position.copy(c3).addScaledVector(dir3, d3);
          ctrl.target.copy(c3); ctrl.update(); forcar = true;
        };

        // ⚠ declarado ANTES dos observadores que o usam: `let` referenciado de um callback que
        // dispare cedo demais estouraria em zona morta temporal.
        let forcar = true;
        const medir = () => {
          const w = el.clientWidth || 800, h = el.clientHeight || (typeof altura === "number" ? altura : 560);
          // ⚠ sem atualizar o CSS do canvas (3º argumento), o buffer fica 800×520 e o elemento
          // continua nos 300×150 padrão do <canvas> — a obra aparece espremida num canto.
          rend.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
        };
        medir();
        window.addEventListener("resize", medir);
        // ⚠ a caixa muda de tamanho sem a janela mudar (painel lateral abre, layout se reorganiza).
        // Sem observar isso, a cena fica esticada até alguém redimensionar o navegador.
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { medir(); forcar = true; }) : null;
        ro?.observe(el);

        // ── clique ──
        const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
        // ⚠⚠ ARRASTAR PRECISA DE TOLERÂNCIA. Vitor (04/09/2026): "nos modelos 3D, tanto do painel de
        // produção quanto do painel do cliente, você tirou a opção de apertar nas peças e aparecer
        // as informações". Não tirei — o guarda de arrasto é que não perdoava: qualquer
        // `pointermove` entre apertar e soltar cancelava a seleção, e o navegador dispara move com
        // um pixel de tremida. No trackpad isso é quase todo clique, e piora quanto mais pesado o
        // modelo (mais tempo entre o down e o up). Agora só conta como giro de câmera quem andou
        // mais de 5 px.
        const TOLERANCIA_PX = 5;
        let ini = null, arrastou = false;
        const down = (ev) => { ini = { x: ev.clientX, y: ev.clientY }; arrastou = false; };
        const move = (ev) => {
          if (!ini) return;
          if (Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) > TOLERANCIA_PX) arrastou = true;
        };
        const up = (ev) => {
          const girou = arrastou;
          ini = null; arrastou = false;
          if (girou) return;                    // girou a câmera: não é seleção
          const r = rend.domElement.getBoundingClientRect();
          pt.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
          pt.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
          ray.setFromCamera(pt, cam);
          // ⚠ o que está apagado pelo filtro não recebe clique: senão a peça de trás, que a pessoa
          // acabou de tirar da vista, roubaria a seleção da que ela está olhando.
          const alvos = [...malhas.values()].filter((m) => !m.userData.foraDoFiltro);
          const hit = ray.intersectObjects(alvos, false)[0];
          const item = hit?.object?.userData?.item || null;
          onSelecionar?.(item ? porItem.get(item) || null : null);
        };
        rend.domElement.addEventListener("pointerdown", down);
        rend.domElement.addEventListener("pointermove", move);
        rend.domElement.addEventListener("pointerup", up);

        // ⚠⚠ DESENHA SÓ QUANDO MUDA. Redesenhar 60 vezes por segundo uma cena parada é queimar GPU
        // à toa — e, num laptop, é o que faz o ventilador subir e o quadro cair justamente quando a
        // pessoa começa a girar. Com damping ligado o `update()` devolve `true` enquanto a inércia
        // corre, então o laço acompanha o movimento e dorme depois.
        let raf = 0;
        const anima = () => {
          raf = requestAnimationFrame(anima);
          const mexeu = ctrl.update();
          if (mexeu || forcar) { rend.render(cena, cam); forcar = false; }
        };
        const pedirQuadro = () => { forcar = true; };
        ctrl.addEventListener("change", pedirQuadro);
        anima();

        ref.current = { THREE, cena, malhas, arestas: malhaArestas, indice, rend, cam, ctrl, irPara, zoom, focar, centro, pedirQuadro };

        // ⚠⚠ REDE DE SEGURANÇA DO PRIMEIRO QUADRO. A cena só é desenhada quando algo pede (é o que
        // faz o ventilador ficar quieto). Se o primeiro pedido acontecer antes de o navegador ter
        // dado ao canvas o tamanho final — layout que ainda está assentando, fonte que chega
        // atrasada, painel que abre —, o único quadro desenhado é o errado e a tela fica branca com
        // a obra inteira carregada atrás. Alguns pedidos nos primeiros segundos custam nada e
        // eliminam a classe inteira de "abriu em branco".
        const insistir = [80, 250, 600, 1200, 2500].map((ms) => setTimeout(() => {
          if (!vivo) return;
          medir();
          forcar = true;
        }, ms));
        limparInsistencia = () => insistir.forEach(clearTimeout);

        setPronto(true);
        setInfo({ conjuntos: total, malhas: malhas.size, geometrias: n });
        onIndice?.({ indice, niveis, semCor });
        setEstado({ fase: "pronto" });

        limpar = () => {
          limparInsistencia();
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", medir);
          ro?.disconnect();
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
        registro.erro("[ifc]", e);
        if (vivo) setEstado({ fase: "erro", erro: e?.message || "Falha ao abrir o modelo." });
      }
    })();
    return () => { vivo = false; limpar(); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠⚠ COR, DESTAQUE E FILTRO NUM EFEITO SÓ. São três coisas que mexem na mesma propriedade do
  // material; separadas em efeitos diferentes, a ordem em que o React os roda decide quem ganha —
  // e o sintoma seria a peça filtrada voltar a acender sozinha ao trocar o modo de cor.
  //
  // ⚠ O QUE SAI DO FILTRO FICA TRANSLÚCIDO, NÃO SOME. Vitor (03/09/2026): "consigo deixar opaco as
  // outras peças (…) como se fosse uma vista da área selecionada". Sumir com o resto tira a
  // referência: a pessoa perde a noção de onde aquele nível fica dentro da obra. A 7% de opacidade
  // o contorno da obra continua legível e o nível escolhido salta.
  useEffect(() => {
    const { THREE, malhas, arestas } = ref.current || {};
    if (!THREE || !malhas) return;
    for (const [, m] of malhas) {
      const fora = !!visiveis && !visiveis.has(m.userData.item);
      // ⚠⚠ OCULTAR É DIFERENTE DE APAGAR. Vitor (03/09/2026): "precisamos ter uma opção para
      // podermos sumir com algum item ou nível (…) para conseguir visualizar melhor as peças
      // selecionadas". Translúcido guarda a referência da obra; oculto limpa a frente. As duas
      // servem, em momentos diferentes — quem escolhe é quem está olhando.
      const some = ocultos?.has(m.userData.item) || (esconderResto && fora);
      m.visible = !some;
      if (some) { m.userData.foraDoFiltro = true; continue; }
      const doEstado = cores?.[m.userData.marca];
      const base = modo === "andamento" && doEstado ? doEstado : m.userData.hex;
      m.userData.foraDoFiltro = fora;
      m.material.color.set(fora ? 0xc3ccd6 : m.userData.item === selecionada ? COR_SEL : base);
      m.material.transparent = fora;
      m.material.opacity = fora ? 0.07 : 1;
      // ⚠ sem isto a peça apagada continua escondendo quem está atrás dela: o buffer de
      // profundidade não sabe de transparência.
      m.material.depthWrite = !fora;
    }
    // ⚠ a obra inteira tem UMA malha de arestas (é o que segura o quadro); com filtro ligado ela
    // não tem como apagar só a parte de fora, então enfraquece junto.
    if (arestas) {
      arestas.material.opacity = visiveis ? 0.1 : 0.38;
      // ⚠⚠ A ARESTA TAMBÉM TEM DE SUMIR. A obra inteira tem UMA malha de contorno (é o que segura
      // o quadro), e ela não sabe filtrar: com "ocultar o resto" ligado, os sólidos sumiam e o
      // desenho de arame de tudo continuava na tela — o que, para quem olha, é o filtro não ter
      // funcionado. Some junto; a parte em foco continua legível porque está sólida e colorida.
      arestas.visible = !(esconderResto && !!visiveis) && !(ocultos?.size > 0 && !visiveis);
    }
    ref.current.pedirQuadro?.();
  }, [selecionada, cores, modo, visiveis, ocultos, esconderResto]);

  useEffect(() => {
    const ouvir = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", ouvir);
    return () => document.removeEventListener("fullscreenchange", ouvir);
  }, []);
  const alternarCheia = () => {
    // ⚠ sai pelo Esc sozinho — é o gesto que a pessoa já tem; o botão é só o caminho de ida.
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    // ⚠ a tela cheia pega a TELA inteira (barra + modelo + painel da peça), não só a caixa do 3D:
    // se pegasse só a caixa, clicar numa peça em tela cheia não mostraria dado nenhum — o painel
    // estaria fora do elemento em tela cheia, e portanto invisível.
    const alvo = caixa.current?.closest("[data-tela-cheia]") || caixa.current;
    alvo?.requestFullscreen?.().catch(() => {});
  };

  const rot = { carregando: "preparando…", baixando: "baixando o modelo…", lendo: "lendo o IFC…", montando: "montando as peças…", juntando: "acabando o desenho…" };

  // ⚠ `altura="fill"` faz a cena ocupar o pai — é o que permite a tela do modelo ir de ponta a
  // ponta em vez de viver dentro de um cartão com altura fixa.
  const enche = altura === "fill";
  return (
    <div ref={caixa} className={`relative bg-white ${enche ? "h-full" : ""}`} style={enche ? undefined : { minHeight: altura }}>
      <div ref={box} className={enche ? "h-full" : ""} style={enche ? undefined : { height: altura }} />
      {/* ⚠ ABRIR MODELO DEMORA — a estrutura da OP-118 tem 37 MB e 13.874 peças, e são dezenas de
          segundos de tela parada. Tela branca com uma linha de texto, nesse tempo, parece travada;
          com a marca e o compasso girando, parece o portal trabalhando. É o mesmo tratamento das
          telas de portal (ver app/portal/[token]). */}
      {estado.fase !== "pronto" && estado.fase !== "erro" && (
        <div className="absolute inset-0 grid place-items-center bg-white/92">
          <div className="flex flex-col items-center gap-3">
            <img src="/torg-logo.png" alt="Torg Metal" className="h-10 opacity-90" />
            <div className="flex items-center gap-2 text-[12.5px] text-torg-gray">
              <Loader2 size={14} className="animate-spin" />
              {rot[estado.fase] || "abrindo…"}
            </div>
            {/* ⚠ a barra não é enfeite: num modelo grande são dezenas de segundos, e sem sinal de
                avanço a pessoa conclui que travou — que foi exatamente o que aconteceu. */}
            {estado.pct > 0 && (
              <div className="w-44 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-torg-orange transition-all duration-200" style={{ width: `${Math.min(100, estado.pct)}%` }} />
              </div>
            )}
          </div>
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
          {/* ⚠ o logo mora DENTRO da cena, no canto de baixo: a tela cheia esconde o portal inteiro,
              e sem ele a obra ficaria flutuando sem dono — ainda mais numa tela de reunião ou num
              print que vai para o cliente. Discreto de propósito: marca, não anúncio. */}
          <img src="/torg-logo.png" alt="Torg Metal" draggable="false"
            className="absolute left-4 bottom-4 h-9 opacity-70 pointer-events-none select-none" />

          <button onClick={alternarCheia} title={cheia ? "Sair da tela cheia (Esc)" : "Preencher a tela"}
            className="absolute right-3 top-[68px] bg-white/95 border border-gray-200 rounded-lg shadow-sm px-2 py-1 text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue">
            {cheia ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <div className="absolute right-3 bottom-3 flex flex-col bg-white/95 border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <button title="Aproximar" onClick={() => ref.current?.zoom?.(0.75)} className="px-2.5 py-1 text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue text-[15px] leading-none">+</button>
            <button title="Afastar" onClick={() => ref.current?.zoom?.(1.35)} className="px-2.5 py-1 text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue text-[15px] leading-none border-t border-gray-200">−</button>
          </div>
        </>
      )}
    </div>
  );
}
