"use client";
import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";

// ─── O CAMPO DE NCM COM AUTOCOMPLETE ─────────────────────────────────────────
//
// ⚠⚠ O NCM É O QUE O OPERADOR MENOS SABE DE CABEÇA, e era o único campo da tela que exigia isso.
// Matheus (22/09/2026): *"no campo NCM deixe uma tabela: conforme vou digitando o NCM vai mostrando
// os resultados próximos"*. O módulo inteiro nasceu da NF-e 973, em que o operador não sabia que o
// 8437.90.00 exigia destaque de IPI — pedir que ele digite o código de memória era manter de pé
// justamente a etapa que causou o erro.
//
// ⚠⚠ E O BANCO JÁ EXISTIA. São 11.103 NCMs da TIPI oficial, versionados, com a coluna `busca`
// (caminho hierárquico, sem acento) e índice GIN — a mesma fonte da aba Consulta NCM. Nada de
// tabela nova: este arquivo é só a tela de um dado que já estava importado.
//
// ⚠ Busca por CÓDIGO e por DESCRIÇÃO no mesmo campo, sem o usuário escolher qual: quem digita
// "8437" quer o código; quem digita "estrutura" quer a descrição. Quem decide é `buscarNcm`.

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * ⚠⚠ UMA LINHA POR NCM, e a GERAL na frente. A busca por código devolve também as linhas de Ex, e
 * no Postgres `ORDER BY "ex"` ASC deixa o `Ex 01` ANTES do NULL da geral — a lista abriria com uma
 * exceção no lugar do código. Aqui o que se escolhe é o NCM; a existência de Ex vira uma marca, e o
 * tratamento de cada um continua na aba Consulta NCM, que é onde ele cabe.
 */
function porNcm(resultados) {
  const m = new Map();
  for (const r of resultados) {
    const atual = m.get(r.ncm);
    if (!atual) m.set(r.ncm, { ...r, exs: r.ex ? 1 : 0 });
    else {
      atual.exs += r.ex ? 1 : 0;
      // A linha SEM Ex é a que representa o código.
      if (!r.ex) m.set(r.ncm, { ...r, exs: atual.exs });
    }
  }
  return [...m.values()];
}

export default function CampoNcm({ valor, onChange, classe = "", id = "ncm" }) {
  const [termo, setTermo] = useState(valor ?? "");
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const caixa = useRef(null);
  // ⚠⚠ RESPOSTA FORA DE ORDEM SOBRESCREVE A CERTA. "8437" sai depois de "84379" com frequência numa
  // rede lenta, e a lista voltaria para o termo anterior enquanto a pessoa ainda digita.
  const vez = useRef(0);
  // ⚠ Escolher da lista não pode disparar uma busca nova — senão o menu reabre no clique.
  const escolhido = useRef(false);

  useEffect(() => { setTermo(valor ?? ""); }, [valor]);

  useEffect(() => {
    if (escolhido.current) { escolhido.current = false; return; }
    const t = termo.trim();
    if (t.length < 2) { setLista([]); setCarregando(false); return; }
    setCarregando(true);
    const minha = ++vez.current;
    const tempo = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fiscal/inteligencia/ncm?q=${encodeURIComponent(t)}&limite=12`);
        const d = await r.json();
        if (minha !== vez.current) return;
        setLista(porNcm(d.resultados ?? []).slice(0, 8));
        setAberto(true);
        setAtivo(-1);
      } catch {
        if (minha === vez.current) setLista([]);
      } finally {
        if (minha === vez.current) setCarregando(false);
      }
    }, 250);
    return () => clearTimeout(tempo);
  }, [termo]);

  // Clique fora fecha — sem isso o menu fica pendurado sobre o resto do formulário.
  useEffect(() => {
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function escolher(r) {
    escolhido.current = true;
    setTermo(r.ncmFormatado);
    onChange(r.ncm);
    setAberto(false);
    setAtivo(-1);
  }

  function digitou(v) {
    setTermo(v);
    // ⚠ O formulário recebe só os DÍGITOS quando já há 8 — é o que o simulador consome. Enquanto
    // não há, ele recebe o texto cru: quem está buscando por descrição ainda não escolheu NCM.
    const d = soDigitos(v);
    onChange(d.length === 8 ? d : v);
  }

  // ⚠ ↑/↓ percorre, Enter escolhe, Esc fecha. Sem teclado, quem digita rápido precisa tirar a mão
  // do teclado para o mouse justamente no campo em que está digitando números.
  function tecla(e) {
    if (!aberto || !lista.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => (i + 1) % lista.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => (i <= 0 ? lista.length - 1 : i - 1)); }
    else if (e.key === "Enter" && ativo >= 0) { e.preventDefault(); escolher(lista[ativo]); }
    else if (e.key === "Escape") { setAberto(false); setAtivo(-1); }
  }

  return (
    <div className="relative" ref={caixa}>
      <div className="relative">
        <input
          id={id} className={`${classe} font-mono pr-8`} placeholder="8437.90.00 ou o nome do produto"
          value={termo} autoComplete="off" role="combobox" aria-expanded={aberto} aria-controls={`${id}-lista`}
          onChange={(e) => digitou(e.target.value)}
          onFocus={() => lista.length && setAberto(true)}
          onKeyDown={tecla} />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray">
          {carregando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </span>
      </div>

      {aberto && (
        <ul id={`${id}-lista`} role="listbox"
            className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {lista.length === 0 ? (
            // ⚠ "Nada encontrado" é resultado, não silêncio: some o menu e a pessoa fica sem saber
            // se o portal buscou. E o texto diz o que mais dá para tentar.
            <li className="px-3 py-2.5 text-xs text-torg-gray">
              Nenhum NCM com esse código ou descrição na TIPI ativa. Tente o começo do código (ex.: <span className="font-mono">8437</span>) ou uma palavra do produto.
            </li>
          ) : lista.map((r, i) => (
            <li key={r.ncm} role="option" aria-selected={i === ativo}>
              <button type="button"
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(r)}
                className={`block w-full px-3 py-2 text-left transition ${i === ativo ? "bg-torg-blue/10" : "hover:bg-gray-50"}`}>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-torg-dark">{r.ncmFormatado}</span>
                  {/* ⚠⚠ A ALÍQUOTA SAI COM O TIPO: "NT", "0%" e "não declarada" são TRÊS coisas
                      diferentes, e mostrar só o número faria as três parecerem zero. */}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    r.ipi.tipo === "PERCENTUAL" && r.ipi.valor > 0 ? "bg-torg-blue/10 text-torg-blue"
                    : r.ipi.tipo === "NT" ? "bg-gray-100 text-torg-gray" : "bg-amber-50 text-amber-700"}`}>
                    IPI {r.ipi.rotulo}
                  </span>
                  {/* ⚠ Ex TIPI vira MARCA na lista, não item separado — é o aviso de que o código
                      sozinho não fecha o tratamento. */}
                  {r.exs > 0 && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      {r.exs} Ex TIPI
                    </span>
                  )}
                </span>
                {/* ⚠⚠ A DESCRIÇÃO É A COMPLETA (com o caminho hierárquico): 23% dos NCMs se
                    descrevem só como "Outros", e uma lista de oito "Outros" não ajuda ninguém. */}
                <span className="mt-0.5 block text-xs leading-snug text-torg-gray line-clamp-2">
                  {r.descricaoCompleta || r.descricao}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
