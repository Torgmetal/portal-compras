"use client";
// FILTRO POR COLUNA, COMO NO EXCEL — o funil no cabeçalho da tabela.
//
// Vitor pediu isso primeiro na lista do PCP (24/08/2026: "criar um filtro igual no excel para
// facilitar o que eu quero filtrar de fato") e depois na lista de expedição. Nasceu dentro do
// ProducaoClient; virou componente na segunda tela, antes de existir a segunda cópia.
//
// ⚠⚠ AS OPÇÕES DE UMA COLUNA RESPEITAM AS OUTRAS, MAS NÃO A SI MESMA. É o que faz o filtro do Excel
// ser usável: escolher um perfil não pode fazer os outros perfis sumirem da lista, senão não há como
// trocar sem antes limpar tudo.
//
// ⚠ MARCAR NADA É O MESMO QUE MARCAR TUDO — o Set vazio é apagado do estado. Filtro com zero
// selecionados escondendo a tabela inteira é a armadilha clássica: quem clicou acha que quebrou.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Filter, X } from "lucide-react";

/**
 * @param {Array} linhas   todas as linhas ANTES dos filtros de coluna
 * @param {Array} colunas  [{ key, label, valor: (linha) => string }]
 */
export function useFiltroColunas(linhas, colunas) {
  const [filtros, setFiltros] = useState({}); // key → Set de valores permitidos
  const porKey = useMemo(() => Object.fromEntries(colunas.map((c) => [c.key, c])), [colunas]);

  const passa = useCallback((linha, exceto) => {
    for (const [k, vals] of Object.entries(filtros)) {
      if (k === exceto || !vals?.size || !porKey[k]) continue;
      if (!vals.has(porKey[k].valor(linha))) return false;
    }
    return true;
  }, [filtros, porKey]);

  const filtradas = useMemo(() => (linhas || []).filter((l) => passa(l, null)), [linhas, passa]);

  const opcoesDaColuna = useCallback((key) => {
    const c = porKey[key];
    if (!c) return [];
    const conta = new Map();
    for (const l of linhas || []) {
      if (!passa(l, key)) continue;
      const v = c.valor(l);
      conta.set(v, (conta.get(v) || 0) + 1);
    }
    return [...conta.entries()]
      .map(([v, n]) => ({ v, n }))
      .sort((a, b) => String(a.v).localeCompare(String(b.v), "pt-BR", { numeric: true }));
  }, [linhas, passa, porKey]);

  const ativos = Object.values(filtros).filter((v) => v?.size).length;
  const limpar = useCallback(() => setFiltros({}), []);
  const rotulosAtivos = Object.entries(filtros).filter(([, v]) => v?.size).map(([k]) => porKey[k]?.label || k);

  return { filtros, setFiltros, passa, filtradas, opcoesDaColuna, ativos, limpar, rotulosAtivos };
}

/**
 * Cabeçalho <th> com o funil. `aberta`/`setAberta` são compartilhados pela tabela para que só um
 * menu fique aberto por vez.
 */
export function ThFiltro({ col, label, larg = "", dica, className = "", filtros, setFiltros, opcoesDaColuna, aberta, setAberta }) {
  const [busca, setBusca] = useState("");
  const [pos, setPos] = useState(null);
  const botaoRef = useRef(null);
  const menuRef = useRef(null);
  const aberto = aberta === col;
  const sel = filtros[col] || null;
  const ativo = !!sel?.size;

  // ⚠⚠ O MENU É `fixed`, POSICIONADO PELO RECT DO BOTÃO — não `absolute`.
  // Estas tabelas vivem dentro de contêiner com `overflow-y-auto` e cabeçalho `sticky`: menu
  // absoluto seria CORTADO na borda da caixa, e o filtro pareceria abrir vazio.
  useEffect(() => {
    if (!aberto) return setPos(null);
    const medir = () => {
      const r = botaoRef.current?.getBoundingClientRect();
      if (!r) return;
      const larguraMenu = 256;
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - larguraMenu - 8)) });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => { window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (menuRef.current?.contains(e.target) || botaoRef.current?.contains(e.target)) return;
      setAberta(null);
    };
    const esc = (e) => { if (e.key === "Escape") setAberta(null); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto, setAberta]);

  const opcoes = aberto ? opcoesDaColuna(col) : [];
  const q = busca.trim().toLowerCase();
  const visiveis = q ? opcoes.filter((o) => String(o.v).toLowerCase().includes(q)) : opcoes;

  const aplicar = (fn) => setFiltros((f) => {
    const s = new Set(f[col] || []);
    fn(s);
    const n = { ...f };
    if (s.size) n[col] = s; else delete n[col];
    return n;
  });

  return (
    <th className={`relative ${larg} ${className}`}>
      <button ref={botaoRef} onClick={() => { setAberta(aberto ? null : col); setBusca(""); }}
        title={ativo ? `${sel.size} valor(es) escolhido(s) — clique para mudar` : dica || "Filtrar esta coluna"}
        className={`inline-flex items-center gap-1 max-w-full ${ativo ? "text-torg-orange" : "hover:text-torg-blue"}`}>
        <span className="truncate">{label}</span>
        <Filter size={10} className={`shrink-0 ${ativo ? "fill-current" : "opacity-40"}`} />
        {ativo && <span className="text-[9px] font-bold shrink-0">{sel.size}</span>}
      </button>

      {aberto && pos && (
        <div ref={menuRef} style={{ top: pos.top, left: pos.left }}
          className="fixed z-[100] w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 font-normal normal-case text-torg-dark">
          <div className="flex items-center gap-1.5 mb-1.5">
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar…"
              className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:border-torg-blue outline-none" />
            <button onClick={() => setAberta(null)} className="text-torg-gray hover:text-torg-dark"><X size={13} /></button>
          </div>
          <div className="flex items-center gap-2 text-[11px] mb-1.5 px-0.5">
            <button onClick={() => aplicar((s) => visiveis.forEach((o) => s.add(o.v)))} className="text-torg-blue hover:underline">
              marcar {q ? "os achados" : "todos"}
            </button>
            <button onClick={() => aplicar((s) => visiveis.forEach((o) => s.delete(o.v)))} className="text-torg-gray hover:underline">limpar</button>
            <span className="ml-auto text-torg-gray-light">{visiveis.length}</span>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {visiveis.map((o) => (
              <label key={o.v} className="flex items-center gap-2 text-[12px] px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={!!sel?.has(o.v)}
                  onChange={() => aplicar((s) => (s.has(o.v) ? s.delete(o.v) : s.add(o.v)))}
                  className="accent-torg-orange shrink-0" />
                <span className="truncate flex-1" title={o.v}>{o.v}</span>
                <span className="text-[10px] text-torg-gray-light tabular-nums shrink-0">{o.n}</span>
              </label>
            ))}
            {!visiveis.length && <p className="text-[11px] text-torg-gray px-1 py-2">nada aqui.</p>}
          </div>
        </div>
      )}
    </th>
  );
}
