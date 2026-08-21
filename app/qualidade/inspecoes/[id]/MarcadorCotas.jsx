"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle, Trash2, Undo2, Maximize2, X } from "lucide-react";
import { layoutCotas, setaEm, PADDING } from "@/lib/cota-marcacao";

/**
 * MARCAR AS COTAS NO DESENHO.
 *
 * Vitor (21/08/2026): "seria possível você trazer apenas o desenho sem as cotas e quem for gerar o
 * relatório eu conseguir fazer a cota no desenho específico?" — e, sobre a referência: "colocarmos
 * cota simples e referenciamos como cota A B C".
 *
 * A pessoa clica em dois pontos do desenho e nasce a cota A; depois a B, a C. Cada uma leva nome,
 * especificação e tolerância, igual ao modelo em Excel dele (`( A ) Interno · Espec. 1250mm +/- 3mm`).
 *
 * ⚠ O CLIQUE GRUDA NO TRAÇO. O desenho chega em vetor, então dá para prender o ponto no vértice
 * mais próximo — a cota nasce na coordenada real do projeto, não onde o mouse caiu. Sem isso, medir
 * em cima de uma imagem erraria alguns milímetros a cada clique.
 *
 * ⚠ A COTA APONTA, NÃO MEDE. O valor de projeto é o que se digita em "Espec."; a linha só mostra
 * ONDE medir. É por isso que não é preciso descobrir a escala do PDF.
 */

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SNAP = 12; // px de imã

export default function MarcadorCotas({ relatorioId, marca, cotas, onChange }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState(null); // primeiro ponto já clicado
  const [hover, setHover] = useState(null);
  const [rascunho, setRascunho] = useState(null); // { ax, ay, bx, by } esperando nome/espec
  const [amplo, setAmplo] = useState(false); // tela cheia — Vitor pediu mais área para marcar
  // ⚠ a tolerância SE LEMBRA entre as cotas: digitar "3" a cada uma é trabalho à toa. Vive aqui, e
  // não dentro do formulário, justamente para sobreviver ao fecha-e-abre de cada cota.
  const [tol, setTol] = useState("3");
  const cv = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro("");
    fetch(`/api/qualidade/inspecoes/${relatorioId}/vetor${marca ? `?marca=${encodeURIComponent(marca)}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then((j) => vivo && setDados(j))
      .catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [relatorioId, marca]);

  // escala e deslocamento para caber na largura disponível
  const layout = useCallback(() => {
    if (!dados || !box.current) return null;
    const dispL = box.current.clientWidth || 600;
    // ⚠ em tela cheia a largura sozinha não serve: uma vista deitada estouraria a altura da janela
    // e a peça sairia cortada embaixo, justamente onde ficam as cotas de nível.
    const dispA = amplo ? Math.max(320, window.innerHeight - 230) : Infinity;
    // ⚠ a peça é desenhada com FOLGA em volta: o recorte é justo nela, e sem folga não há onde
    // colocar as linhas de cota, que por definição ficam FORA da peça.
    const W = dados.largura + PADDING * 2, H = dados.altura + PADDING * 2;
    const esc = Math.min(dispL / W, dispA / H);
    return { esc, larg: W * esc, alt: H * esc };
  }, [dados, amplo]);

  // vértices para o imã
  const vertices = useCallback(() => {
    if (!dados) return [];
    const v = [];
    for (const [x1, y1, x2, y2] of dados.segs) { v.push([x1, y1]); v.push([x2, y2]); }
    return v;
  }, [dados]);

  // coordenada JÁ com a folga (é o que `layoutCotas` devolve)
  const telaPad = (p, L) => [p[0] * L.esc, L.alt - p[1] * L.esc];
  // coordenada da VISTA (geometria e texto do desenho): soma a folga antes
  const paraTela = (p, L) => telaPad([p[0] + PADDING, p[1] + PADDING], L);
  const paraDesenho = (x, y, L) => [x / L.esc - PADDING, (L.alt - y) / L.esc - PADDING];

  useEffect(() => {
    const L = layout();
    if (!L || !cv.current) return;
    const c = cv.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = L.larg * dpr; c.height = L.alt * dpr;
    c.style.width = `${L.larg}px`; c.style.height = `${L.alt}px`;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L.larg, L.alt);
    g.fillStyle = "#fff"; g.fillRect(0, 0, L.larg, L.alt);

    // o desenho
    g.strokeStyle = "#334155"; g.lineWidth = 0.6; g.beginPath();
    for (const [x1, y1, x2, y2] of dados.segs) {
      const a = paraTela([x1, y1], L), b = paraTela([x2, y2], L);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();

    // o texto do desenho — as cotas do projeto e as marcas das peças.
    // ⚠ é ele que diz QUAL valor digitar em "Espec."; sem isso a tela é um contorno mudo e a pessoa
    // teria de abrir o desenho por fora para descobrir o número.
    g.fillStyle = "#0f172a";
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    for (const t of dados.textos || []) {
      const [tx, ty] = paraTela([t.x, t.y], L);
      const tam = Math.max(5, t.t * L.esc);
      g.save();
      g.translate(tx, ty);
      if (t.v) g.rotate(-Math.PI / 2); // cota vertical vem girada no desenho
      g.font = `${tam}px sans-serif`;
      g.fillText(t.s, 0, 0);
      g.restore();
    }

    // ── AS COTAS A / B / C ──────────────────────────────────────────────────────────────────
    //
    // Linha de chamada clássica, FORA da peça, com as extensões descendo até os pontos marcados e
    // a letra por cima — o desenho que o Vitor mandou. Ela mostra ONDE medir; o valor fica na
    // tabela do relatório.
    const traco = (a, b) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
    const marcas = layoutCotas(cotas, dados.largura, dados.altura);
    marcas.forEach((m) => {
      if (!m) return;
      g.strokeStyle = "#F4801F";
      // as extensões são finas: elas guiam o olho, não competem com o desenho
      g.lineWidth = 0.8;
      traco(telaPad(m.ext1.a, L), telaPad(m.ext1.b, L));
      traco(telaPad(m.ext2.a, L), telaPad(m.ext2.b, L));
      g.lineWidth = 1.4;
      const la = telaPad(m.linha.a, L), lb = telaPad(m.linha.b, L);
      traco(la, lb);
      // setas apontando para FORA, como no desenho técnico
      for (const [p, q] of [[la, lb], [lb, la]]) {
        for (const [s1, s2] of setaEm(p, [q[0] - p[0], q[1] - p[1]], 6)) traco(s1, s2);
      }
      const r = telaPad([m.rotulo.x, m.rotulo.y], L);
      g.fillStyle = "#F4801F";
      g.font = "bold 12px sans-serif";
      g.textAlign = "center"; g.textBaseline = m.vertical ? "middle" : "bottom";
      g.save();
      g.translate(r[0], r[1]);
      if (m.vertical) { g.rotate(-Math.PI / 2); g.textBaseline = "bottom"; }
      g.fillText(String(m.letra || ""), 0, 0);
      g.restore();
    });

    // o traço que está sendo criado agora: cru, sobre a peça, só para conferir as duas pontas
    if (rascunho) {
      const a = paraTela([rascunho.ax, rascunho.ay], L), b = paraTela([rascunho.bx, rascunho.by], L);
      g.strokeStyle = "#006EAB"; g.lineWidth = 2; g.setLineDash([5, 3]);
      traco(a, b); g.setLineDash([]);
      for (const pt of [a, b]) { g.beginPath(); g.arc(pt[0], pt[1], 3, 0, 7); g.fillStyle = "#006EAB"; g.fill(); }
    }

    // o ponto pendente e a borracha do imã
    if (pendente) {
      const p = paraTela(pendente, L);
      g.fillStyle = "#006EAB"; g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill();
      if (hover) {
        const h = paraTela(hover, L);
        g.strokeStyle = "#006EAB"; g.lineWidth = 1.5; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(h[0], h[1]); g.stroke();
        g.setLineDash([]);
      }
    }
    if (hover) {
      const h = paraTela(hover, L);
      g.strokeStyle = "#006EAB"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(h[0], h[1], 5, 0, 7); g.stroke();
    }
  }, [dados, cotas, pendente, hover, rascunho, layout]);

  // ⚠ sem isto o canvas fica com o tamanho antigo ao abrir a tela cheia ou girar o aparelho, e o
  // clique passa a cair alguns pixels fora do traço.
  const [, redesenhar] = useState(0);
  useEffect(() => {
    const f = () => redesenhar((v) => v + 1);
    window.addEventListener("resize", f);
    const t = setTimeout(f, 30); // a caixa só tem largura final depois de pintar
    return () => { window.removeEventListener("resize", f); clearTimeout(t); };
  }, [amplo]);

  function pontoDoEvento(e) {
    const L = layout(); if (!L) return null;
    const r = cv.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const [dx, dy] = paraDesenho(x, y, L);
    // imã: o vértice mais próximo dentro do raio
    let melhor = null, dist = SNAP / L.esc;
    for (const v of vertices()) {
      const d = Math.hypot(v[0] - dx, v[1] - dy);
      if (d < dist) { dist = d; melhor = v; }
    }
    return melhor || [dx, dy];
  }

  /**
   * OS VALORES QUE O DESENHO DECLARA JUNTO DESTA LINHA.
   *
   * Vitor (21/08/2026), vendo a coluna de dimensões vazia: "como podemos melhorar essa questão
   * desse preenchimento?".
   *
   * Hoje ele lê o número na tela e digita o mesmo número — retrabalho puro, e é onde entra erro de
   * digitação. Aqui o portal devolve os candidatos e ele toca em um.
   *
   * ⚠ Continua sendo o USUÁRIO quem escolhe. Eu não acerto sozinho qual cota vale — já tentei por
   * três caminhos e todos erram (inclusive porque o eixo do desenho pode ser interrompido, o que
   * derruba qualquer regra de três). Oferecer as opções é honesto; decidir por ele não seria.
   *
   * Ordem: primeiro a diferença entre os níveis das duas pontas (a leitura mais firme, porque as
   * pontas foram escolhidas por quem marcou), depois os números escritos ao longo da linha, do
   * maior para o menor — numa cadeia, o total costuma ser o que interessa.
   */
  function candidatos(r) {
    if (!r) return [];
    const nums = (dados.textos || [])
      .map((t) => ({ ...t, n: /^\d{1,5}$/.test(String(t.s).trim()) ? parseInt(t.s, 10) : null }))
      .filter((t) => t.n != null);
    const comp = Math.hypot(r.bx - r.ax, r.by - r.ay);
    if (comp < 2) return [];

    const perto = (px, py, raio = 34) => nums
      .map((t) => ({ t, d: Math.hypot(t.x - px, t.y - py) }))
      .filter((o) => o.d < raio).sort((a, b) => a.d - b.d)[0]?.t || null;

    const out = [];
    const a = perto(r.ax, r.ay), b = perto(r.bx, r.by);
    if (a && b && a.n !== b.n) out.push(Math.abs(b.n - a.n));

    const ux = (r.bx - r.ax) / comp, uy = (r.by - r.ay) / comp;
    const aoLongo = nums.filter((t) => {
      const vx = t.x - r.ax, vy = t.y - r.ay;
      const proj = vx * ux + vy * uy;
      if (proj < -8 || proj > comp + 8) return false;
      return Math.abs(vx * -uy + vy * ux) < 24;
    }).map((t) => t.n).sort((x, y) => y - x);

    for (const n of aoLongo) if (!out.includes(n)) out.push(n);
    // ⚠ 8, não 6: numa cadeia longa (438, 373, 811, 152, 963, 750, 1714, 1771) o total costuma ser
    // o último a entrar, e cortar antes esconderia justamente o que interessa.
    return out.slice(0, 8);
  }

  function clique(e) {
    const p = pontoDoEvento(e); if (!p) return;
    if (!pendente) { setPendente(p); return; }
    setRascunho({ ax: pendente[0], ay: pendente[1], bx: p[0], by: p[1] });
    setPendente(null);
  }

  function confirmar(espec) {
    const letra = LETRAS[cotas.length] || `C${cotas.length + 1}`;
    onChange([...cotas, {
      letra,
      // ⚠ o rótulo é SÓ "Cota A". Vitor (21/08/2026): "nas marcações laterais você precisa trazer
      // apenas isso: cota A, Cota B e Cota C". Quem diz o que medir é a marca no desenho, não um
      // nome repetido na tabela.
      descricao: `Cota ${letra}`,
      projetoMm: espec === "" ? null : Number(espec),
      tolerancia: tol ? `± ${tol}` : "",
      encontradoMm: null,
      ...rascunho,
    }]);
    setRascunho(null);
  }

  function remover(i) {
    // ⚠ as letras se renumeram: buraco no meio (A, C, D) confunde quem mede
    const restantes = cotas.filter((_, k) => k !== i).map((c, k) => {
      const letra = LETRAS[k] || `C${k + 1}`;
      return { ...c, letra, descricao: `Cota ${letra}` };
    });
    onChange(restantes);
  }

  if (erro) return <p className="text-[12px] text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={14} /> {erro}</p>;
  if (!dados) return <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> lendo o desenho…</p>;

  const conteudo = (
    <div className={amplo ? "fixed inset-0 z-50 bg-white p-4 overflow-auto" : ""}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-[11px] text-torg-gray">
          {pendente ? "Agora clique no segundo ponto da cota." : "Clique em dois pontos do desenho para criar uma cota. O clique gruda no traço."}
          {pendente && <button onClick={() => setPendente(null)} className="ml-2 text-torg-blue inline-flex items-center gap-1"><Undo2 size={11} /> cancelar</button>}
        </p>
        <button onClick={() => setAmplo((v) => !v)}
          className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium shrink-0">
          {amplo ? <><X size={13} /> Fechar</> : <><Maximize2 size={13} /> Ampliar</>}
        </button>
      </div>
      <div ref={box} className="border border-gray-200 rounded-lg overflow-hidden bg-white inline-block max-w-full">
        <canvas ref={cv} onClick={clique} onMouseMove={(e) => setHover(pontoDoEvento(e))} onMouseLeave={() => setHover(null)}
          className="block cursor-crosshair" />
      </div>

      {rascunho && (
        <BarraCota
          letra={LETRAS[cotas.length] || "?"}
          valores={candidatos(rascunho)}
          tol={tol} onTol={setTol}
          onConfirmar={confirmar}
          onCancelar={() => setRascunho(null)}
        />
      )}

      {cotas.length > 0 && (
        <ul className="mt-2 space-y-1 max-w-2xl">
          {cotas.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-5 h-5 rounded-full bg-torg-orange text-white font-bold text-[10px] inline-flex items-center justify-center shrink-0">{c.letra}</span>
              <span className="text-torg-dark flex-1">{c.descricao}</span>
              <span className="font-mono text-torg-dark">{c.projetoMm ?? "—"}</span>
              <span className="text-torg-gray w-14 text-right">{c.tolerancia || ""}</span>
              <button onClick={() => remover(i)} className="text-torg-gray hover:text-red-600"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // em tela cheia o bloco sai do fluxo; deixa um aviso no lugar para a página não "pular"
  return amplo ? (
    <>
      <p className="text-[12px] text-torg-gray py-4">Marcando cotas em tela cheia…</p>
      {conteudo}
    </>
  ) : conteudo;
}

/**
 * A BARRA DA COTA — um toque no valor e a cota está criada.
 *
 * Vitor pediu para melhorar o preenchimento. Antes era: ler o número na tela, digitar o mesmo
 * número, ajustar a tolerância, confirmar. Agora os valores que o desenho declara junto da linha
 * viram botões; tocar num deles CRIA a cota na hora, com a tolerância que já estava valendo.
 *
 * ⚠ Sem passo de confirmação de propósito — é o "modo em série" que ele pediu: clique, clique,
 * toque; clique, clique, toque. Errou? A cota some com um clique na lixeira, ali embaixo.
 *
 * ⚠ O campo de digitar continua, para o desenho que não declara o número. Não dá para depender só
 * da leitura: nem toda cota está escrita na folha.
 */
function BarraCota({ letra, valores, tol, onTol, onConfirmar, onCancelar }) {
  const [outro, setOutro] = useState("");
  return (
    <div className="mt-2 p-2.5 bg-torg-blue-50 border border-torg-blue-200 rounded-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-6 h-6 rounded-full bg-torg-blue text-white font-bold text-[11px] inline-flex items-center justify-center shrink-0">{letra}</span>
        <span className="text-[12px] font-semibold text-torg-dark">Cota {letra}</span>

        {valores.length > 0 ? (
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-torg-gray">do desenho:</span>
            {valores.map((v) => (
              <button key={v} onClick={() => onConfirmar(v)}
                className="text-[12px] font-mono font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded px-2 py-1">
                {v}
              </button>
            ))}
          </span>
        ) : (
          <span className="text-[10px] text-torg-gray">não achei número no desenho aqui</span>
        )}

        <span className="flex-1" />

        <label className="inline-flex items-center gap-1">
          <span className="text-[10px] text-torg-gray">Tol. ±</span>
          <input type="number" value={tol} onChange={(e) => onTol(e.target.value)}
            className="w-14 border border-gray-200 rounded px-1.5 py-1 text-[12px] font-mono" />
        </label>
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        <input type="number" value={outro} onChange={(e) => setOutro(e.target.value)}
          placeholder="outro valor (mm)"
          onKeyDown={(e) => { if (e.key === "Enter" && outro !== "") onConfirmar(Number(outro)); }}
          className="w-40 border border-gray-200 rounded px-2 py-1 text-[12px] font-mono" />
        <button onClick={() => outro !== "" && onConfirmar(Number(outro))} disabled={outro === ""}
          className="text-[12px] text-torg-blue font-medium disabled:opacity-40">usar este</button>
        <span className="flex-1" />
        <button onClick={onCancelar} className="text-[12px] text-torg-gray">Cancelar</button>
      </div>
    </div>
  );
}

