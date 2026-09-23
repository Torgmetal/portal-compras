"use client";
import { useEffect, useRef, useState } from "react";
import { Search, Loader2, AlertTriangle } from "lucide-react";

// ─── O CAMPO DE NCM COM AUTOCOMPLETE ─────────────────────────────────────────
//
// ⚠⚠ O NCM É O QUE O OPERADOR MENOS SABE DE CABEÇA, e era o único campo da tela que exigia isso.
// Matheus (22/09/2026): *"no campo NCM deixe uma tabela: conforme vou digitando o NCM vai mostrando
// os resultados próximos"*. O módulo inteiro nasceu da NF-e 973, em que o operador não sabia que o
// 8437.90.00 exigia destaque de IPI — pedir que ele digite o código de memória era manter de pé
// justamente a etapa que causou o erro.
//
// ⚠⚠ E O BANCO JÁ EXISTIA. São 11.103 NCMs da TIPI oficial, versionados, com a coluna `busca`
// (caminho hierárquico, sem acento) e índice GIN — a mesma fonte da aba Consulta NCM.
//
// ⚠ Busca por CÓDIGO e por DESCRIÇÃO no mesmo campo, sem o usuário escolher qual: quem digita
// "8437" quer o código; quem digita "estrutura" quer a descrição. Quem decide é `buscarNcm`.

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * ⚠⚠ UMA LINHA POR NCM — E A LINHA DE Ex NUNCA FALA PELO CÓDIGO (achado do Codex, 22/09/2026).
 *
 * A busca corta no LIMITE antes de agrupar, e na busca por código o Postgres devolve o `Ex 01`
 * ANTES do NULL da geral. Resultado: dava para a lista mostrar a **alíquota da exceção** como se
 * fosse a do NCM — e o clique manda só os 8 dígitos, jogando fora a exceção de onde o número
 * saiu. Seria o contrato 2 do módulo quebrado pela própria tela: *"Ex desconhecido não significa
 * geral"*.
 *
 * ⚠ Sem a linha geral na resposta, a entrada aparece **sem número**, dizendo que depende do Ex.
 * Vazio manda perguntar; número errado vai para a nota.
 */
function porNcm(resultados) {
  const m = new Map();
  for (const r of resultados) {
    const atual = m.get(r.ncm);
    if (!atual) m.set(r.ncm, { ...r, geral: !r.ex, exs: r.ex ? 1 : 0 });
    else if (!r.ex) m.set(r.ncm, { ...r, geral: true, exs: atual.exs });
    else atual.exs += 1;
  }
  return [...m.values()];
}

/**
 * ⚠⚠ ERRO NÃO É "NENHUM NCM" (achado do Codex, 22/09/2026). A resposta era consumida sem olhar
 * `r.ok` nem `d.success`: um 403 ou uma queda de rede viravam a mesma frase de lista vazia, e a
 * pessoa concluía que o código não existe quando o que houve foi falha de consulta. São três
 * estados distintos — erro (com nova tentativa), referência ausente (conserto de administrador) e
 * busca válida sem resultado.
 */
async function consultarNcm(termo) {
  try {
    const r = await fetch(`/api/fiscal/inteligencia/ncm?q=${encodeURIComponent(termo)}&limite=12`);
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.success) return { erro: d?.error || `Falha na consulta (HTTP ${r.status}).` };
    return { resultados: d.resultados ?? [], motivo: d.motivo ?? null };
  } catch (e) {
    return { erro: `Não foi possível consultar a TIPI: ${e.message}` };
  }
}

export default function CampoNcm({ valor, onChange, classe = "", id = "ncm" }) {
  const [termo, setTermo] = useState(valor ?? "");
  // ⚠⚠ O QUE SE BUSCA É SEPARADO DO QUE SE MOSTRA (achado do Codex). Antes eram a mesma coisa, e
  // escolher da lista entrava num laço: `escolher` gravava "8437.90.00" no campo e mandava
  // "84379000" ao formulário; o pai devolvia isso como `valor`, o campo trocava o texto pelos
  // dígitos — string diferente — e a busca disparava DE NOVO, reabrindo o menu que acabara de
  // fechar. Agora só quem digita mexe na consulta.
  const [consulta, setConsulta] = useState("");
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [motivo, setMotivo] = useState(null);
  const [ativo, setAtivo] = useState(-1);
  // ⚠ "Tentar de novo" precisa de um contador: repor o MESMO termo em `consulta` não reexecuta o
  // efeito, e o botão ficaria mudo justamente quando a rede caiu.
  const [tentativa, setTentativa] = useState(0);
  const caixa = useRef(null);
  // ⚠⚠ RESPOSTA FORA DE ORDEM SOBRESCREVE A CERTA. "8437" sai depois de "84379" com frequência numa
  // rede lenta, e a lista voltaria para o termo anterior enquanto a pessoa ainda digita.
  const vez = useRef(0);

  /** ⚠ Invalida o que estiver no ar. Usado ao limpar, ao escolher e ao trocar de termo. */
  const invalidar = () => { vez.current += 1; };

  // ⚠ Só sincroniza quando o pai traz algo que o campo ainda NÃO representa — comparando por
  // dígitos, porque "8437.90.00" e "84379000" são o mesmo NCM escrito de dois jeitos.
  useEffect(() => {
    if (soDigitos(valor) === soDigitos(termo)) return;
    invalidar();
    setTermo(valor ?? "");
    setConsulta("");
    setLista([]);
    setAberto(false);
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = consulta.trim();
    // ⚠⚠ LIMPAR O CAMPO PRECISA INVALIDAR O QUE ESTÁ NO AR (achado do Codex). Antes o retorno
    // acontecia ANTES de incrementar a vez: a requisição já disparada continuava válida, e
    // resolvia depois chamando `setAberto(true)` — sugestões reaparecendo sobre um campo vazio,
    // prontas para serem escolhidas.
    if (t.length < 2) { invalidar(); setLista([]); setCarregando(false); setErro(null); setMotivo(null); return; }
    setCarregando(true);
    invalidar();
    const minha = vez.current;
    const tempo = setTimeout(async () => {
      const r = await consultarNcm(t);
      if (minha !== vez.current) return;
      setCarregando(false);
      setAtivo(-1);
      setAberto(true);
      setErro(r.erro ?? null);
      setMotivo(r.erro ? null : (r.motivo ?? null));
      setLista(r.erro ? [] : porNcm(r.resultados).slice(0, 8));
    }, 250);
    return () => clearTimeout(tempo);
  }, [consulta, tentativa]);

  // Clique fora fecha — sem isso o menu fica pendurado sobre o resto do formulário.
  useEffect(() => {
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function escolher(r) {
    invalidar();
    setTermo(r.ncmFormatado);
    setConsulta("");
    setAberto(false);
    setAtivo(-1);
    onChange(r.ncm);
  }

  function digitou(v) {
    setTermo(v);
    setConsulta(v);
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
          {erro ? (
            <li className="px-3 py-2.5 text-xs text-amber-800">
              <span className="flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  {erro}
                  <button type="button" onClick={() => setTentativa((n) => n + 1)}
                          className="ml-1 font-medium text-torg-blue underline">Tentar de novo</button>
                </span>
              </span>
            </li>
          ) : motivo ? (
            // ⚠ "Nenhuma TIPI importada" é outra coisa que "esse NCM não existe" — e o conserto
            // é de administrador, não de quem está digitando.
            <li className="px-3 py-2.5 text-xs text-amber-800">{motivo}</li>
          ) : lista.length === 0 ? (
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
                  {/* ⚠⚠ SEM A LINHA GERAL NA RESPOSTA, NÃO SAI NÚMERO. A alíquota de um Ex não
                      responde pelo NCM — e o clique manda só os 8 dígitos, jogando fora a exceção
                      de onde o número teria saído. */}
                  {r.geral ? (
                    // ⚠⚠ A ALÍQUOTA SAI COM O TIPO: "NT", "0%" e "não declarada" são TRÊS coisas
                    // diferentes, e mostrar só o número faria as três parecerem zero.
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      r.ipi.tipo === "PERCENTUAL" && r.ipi.valor > 0 ? "bg-torg-blue/10 text-torg-blue"
                      : r.ipi.tipo === "NT" ? "bg-gray-100 text-torg-gray" : "bg-amber-50 text-amber-700"}`}>
                      IPI {r.ipi.rotulo}
                    </span>
                  ) : (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      IPI depende do Ex — abra a Consulta NCM
                    </span>
                  )}
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
