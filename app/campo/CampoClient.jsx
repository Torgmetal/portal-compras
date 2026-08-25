"use client";
import { useState, useEffect, useCallback } from "react";
import Medir from "./Medir";
import RNCs from "./RNCs";
import NovoRelatorio from "./NovoRelatorio";
import { signOut } from "next-auth/react";
import { Loader2, QrCode, Search, X, Check, ChevronLeft, HardHat, LogOut, AlertCircle, Tag, Ruler, KeyRound } from "lucide-react";
import { marcaDoQR, marcaCasaOP } from "@/lib/qualidade-campo";
import { instrumentosDoTipo, FONTE_POR_TIPO } from "@/lib/instrumentos-por-relatorio";
import LeitorQR from "./LeitorQR";

/**
 * PORTAL QUALIDADE FÁBRICA — a tela do celular.
 *
 * Vitor (21/08/2026): "seleciona a OP, tipo de relatório, tira a foto e informa qual peça; isso
 * sobe para o portal, e depois por computador começa o fluxo das assinaturas".
 *
 * Escolhida a OP, a tela abre um de três caminhos: preencher um relatório que já existe, abrir uma
 * RNC ou criar um relatório na hora. A foto não tem caminho próprio — ela nasce dentro do
 * relatório (ver a nota no fim do componente).
 *
 * 🚫 Nenhum nome de cliente nesta tela. Vitor: "pode deixar aberto, só não deixa o nome do cliente;
 * para esse acesso deixar apenas o número da OP" — dois dos cinco usuários são inspetores externos.
 */

export default function CampoClient({ nome }) {
  const [op, setOp] = useState(null);          // { id, numero }
  // "medir" | "rnc" | "novo" — o que o inspetor veio fazer nesta OP
  const [modo, setModo] = useState(null);
  // Vitor (21/08/2026): "além de informar a peça e a OP, ele seleciona os equipamentos que está
  // usando para compor no relatório". Fica fixo como a peça — o inspetor mede a manhã inteira com
  // a mesma trena, e remarcar a cada foto seria trabalho à toa.
  const [equipamentos, setEquipamentos] = useState([]);

  // ── retoma onde parou ──────────────────────────────────────────────────────────────────────
  // O navegador do celular descarta a aba quando o aparelho fica no bolso ou abre a câmera. Sem
  // isso, o inspetor volta pra tela inicial e refaz a OP.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("campo:sessao") || "null");
      if (s?.op?.numero) {
        setOp(s.op);
        setEquipamentos(Array.isArray(s.equipamentos) ? s.equipamentos : []);
      }
    } catch { /* storage indisponível: segue sem retomar */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("campo:sessao", JSON.stringify({ op, equipamentos })); } catch { /* ignora */ }
  }, [op, equipamentos]);

  // ── passo 1: a OP ──────────────────────────────────────────────────────────────────────────
  if (!op) return <EscolherOP onEscolher={setOp} nome={nome} />;

  // ── passo 2: o que ele veio fazer ──────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "não estou conseguindo acessar os relatórios na tela do inspetor de campo".
  // O portal só sabia captar foto. Hoje os três caminhos giram em torno do relatório: MEDIR é
  // responder a um que alguém já montou no computador, com cotas e tolerâncias definidas; CRIAR
  // abre um ali mesmo, sem esperar o computador; RNC é a não conformidade que sai da reprovação.
  if (!modo) {
    return (
      <Tela titulo={`OP-${op.numero}`} voltar={() => setOp(null)}>
        <p className="text-sm text-torg-gray mb-3">O que você vai fazer?</p>
        <div className="space-y-2">
          <button onClick={() => setModo("medir")}
            className="w-full text-left bg-white border-2 border-torg-blue rounded-xl px-4 py-4 active:bg-torg-blue/5">
            <span className="block text-base font-semibold text-torg-blue">Preenchimento de relatórios</span>
            <span className="block text-[13px] text-torg-gray">informar as medidas dos relatórios desta obra</span>
          </button>
          {/* ⚠ RNC ao lado do preenchimento, a pedido do Vitor. Não é acessório: a reprovação de
              uma inspeção abre RNC automaticamente, e quem reprovou é quem melhor sabe o que ela
              descreve — deixá-la só no computador quebraria a linha que acabamos de ligar. */}
          <button onClick={() => setModo("rnc")}
            className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 active:bg-gray-50">
            <span className="block text-base font-semibold text-torg-dark">RNC</span>
            <span className="block text-[13px] text-torg-gray">não conformidades abertas nesta OP</span>
          </button>
          {/* ⚠ "REGISTRAR FOTOS" SAIU. Vitor (22/08/2026): "pode tirar esse botão do painel do
              Inspetor de Campo, pois ele vai registrar as imagens dentro do relatório; apenas
              criar um botão para criar relatório". A foto solta era do tempo em que o relatório
              nascia depois dela; hoje ela nasce amarrada ao documento, e um caminho que produz
              foto sem dono só recria a fila que acabamos de eliminar. */}
          <button onClick={() => setModo("novo")}
            className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 active:bg-gray-50">
            <span className="block text-base font-semibold text-torg-dark">Criar relatório</span>
            <span className="block text-[13px] text-torg-gray">abrir uma inspeção nova, sem esperar o computador</span>
          </button>
        </div>
      </Tela>
    );
  }

  if (modo === "rnc") {
    return <RNCs op={op} onSair={() => setModo(null)} Tela={Tela} />;
  }

  if (modo === "medir") {
    return <Medir op={op} onSair={() => setModo(null)} Tela={Tela} Equipamentos={Equipamentos} />;
  }

  if (modo === "novo") {
    return (
      <NovoRelatorio op={op} Tela={Tela} onSair={() => setModo(null)}
        // criado, cai direto no preenchimento: o inspetor está com a peça na frente
        onCriado={() => setModo("medir")} />
    );
  }

  // ⚠ O CAMINHO DA FOTO SOLTA FOI REMOVIDO (22/08/2026). Ele existia de quando o relatório
  // nascia DEPOIS da foto: o inspetor fotografava, a foto ia para uma fila e alguém montava o
  // documento no computador. Hoje é o contrário — a foto nasce dentro do relatório, e o inspetor
  // cria o próprio relatório aqui mesmo. Manter os dois caminhos recriaria a fila de fotos sem
  // dono que acabamos de eliminar.
  return null;
}

/** Moldura comum: cabeçalho fixo, conteúdo rolando. Sem menu — a tela é de uma coisa só. */
function Tela({ titulo, sub, voltar, children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-torg-dark text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        {voltar ? (
          <button onClick={voltar} className="p-1 -ml-1"><ChevronLeft size={22} /></button>
        ) : (
          <HardHat size={20} />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight truncate">{titulo}</p>
          {sub && <p className="text-[11px] text-white/70 leading-tight truncate">{sub}</p>}
        </div>
        {/* ⚠ `voltar=/campo` porque a saída daqui NÃO é /entrar: o inspetor tem login próprio, e
            devolvê-lo à tela do portal interno seria mandá-lo para uma porta que não é a dele. */}
        <a href="/trocar-senha?voltar=/campo" title="Trocar minha senha" className="p-1 text-white/70"><KeyRound size={18} /></a>
        <button onClick={() => signOut({ callbackUrl: "/campo/entrar" })} className="p-1 text-white/70"><LogOut size={18} /></button>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}

function EscolherOP({ onEscolher, nome }) {
  const [ops, setOps] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/campo/ops").then((r) => r.json()).then((j) => setOps(j.ops || [])).catch(() => setOps([]));
  }, []);

  const lista = (ops || []).filter((o) => !q || o.numero.toLowerCase().includes(q.toLowerCase()));

  return (
    <Tela titulo="Qualidade Fábrica" sub={nome}>
      <p className="text-sm text-torg-gray mb-3">Em qual OP você está?</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="numeric" placeholder="buscar OP…"
        className="w-full text-base border border-gray-200 rounded-xl px-3 py-3 mb-3 focus:border-torg-blue outline-none" />
      {ops === null && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>}
      <div className="grid grid-cols-3 gap-2">
        {lista.map((o) => (
          <button key={o.id} onClick={() => onEscolher(o)}
            className="bg-white border border-gray-200 rounded-xl py-4 text-base font-bold text-torg-dark active:bg-gray-50">
            {o.numero}
          </button>
        ))}
      </div>
      {ops !== null && !lista.length && <p className="text-sm text-torg-gray">Nenhuma OP encontrada.</p>}
    </Tela>
  );
}

/**
 * A peça da vez. Fica fixa no topo até trocarem — é ela que as próximas fotos recebem.
 */
function PecaAtual({ peca, opNumero, opId, onDefinir }) {
  const [lendo, setLendo] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const aoLerQR = useCallback((texto) => {
    setLendo(false);
    const marca = marcaDoQR(texto);
    if (!marca) { onDefinir(peca, "Não entendi esse código. Tente de novo ou busque a marca."); return; }
    // ⚠ AVISA, não bloqueia: sub-obra usa prefixo próprio (T67B, T67CT) e obra antiga foge do
    // padrão. Travar aqui faria o inspetor não registrar uma foto legítima no meio do galpão.
    const av = marcaCasaOP(marca, opNumero) ? "" : `A peça ${marca} parece ser de outra OP. Confira antes de fotografar.`;
    onDefinir({ marca, origem: "QR" }, av);
  }, [onDefinir, peca, opNumero]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3">
      <div className="flex items-center gap-2 min-w-0">
        <Tag size={16} className="text-torg-blue shrink-0" />
        {peca ? (
          <div className="min-w-0 flex-1">
            <p className="font-bold text-torg-dark text-base leading-tight truncate">{peca.marca}</p>
            <p className="text-[11px] text-torg-gray leading-tight">
              {peca.origem === "QR" ? "lida no QR do desenho" : peca.origem === "BUSCA" ? "escolhida na lista" : "digitada"}
            </p>
          </div>
        ) : (
          <p className="flex-1 text-sm text-torg-gray">Nenhuma peça selecionada — a foto entra como registro geral.</p>
        )}
        {peca && <button onClick={() => onDefinir(null, "")} className="text-torg-gray p-1"><X size={16} /></button>}
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={() => setLendo(true)}
          className="flex-1 bg-torg-blue/10 text-torg-blue rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <QrCode size={16} /> Ler QR
        </button>
        <button onClick={() => setBuscando(true)}
          className="flex-1 border border-gray-200 text-torg-dark rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <Search size={16} /> Buscar
        </button>
      </div>

      {lendo && <LeitorQR onLer={aoLerQR} onFechar={() => setLendo(false)} />}
      {buscando && (
        <BuscarPeca
          opId={opId}
          onFechar={() => setBuscando(false)}
          onEscolher={(marca, origem) => { setBuscando(false); onDefinir({ marca, origem }, ""); }}
        />
      )}
    </div>
  );
}

/**
 * OS INSTRUMENTOS DA VEZ.
 *
 * Vitor (21/08/2026): "para os relatórios temos equipamentos calibrados... ele seleciona os
 * equipamentos que está usando para compor no relatório".
 *
 * A lista vem do módulo de Calibração — os mesmos certificados, com validade. Ficam gravados na
 * foto em SNAPSHOT: quando o certificado for renovado, o relatório antigo continua mostrando o que
 * estava valendo no dia da inspeção.
 *
 * ⚠ Instrumento VENCIDO aparece na lista, marcado em vermelho. Sumir com ele faria o inspetor
 * medir com o mesmo instrumento e não registrar nada — o relatório sairia sem dizer com o que foi
 * medido, que é pior. Aparece, avisa, e quem decide é quem está lá.
 */
function Equipamentos({ escolhidos, onMudar, tipo = null }) {
  const [abrir, setAbrir] = useState(false);
  const [lista, setLista] = useState(null);
  // ⚠ só os do procedimento, com escape. Ver a nota em lib/instrumentos-por-relatorio.js:
  // a lista de calibração é da fábrica inteira, e instrumento errado no relatório é pior
  // que instrumento faltando — mas travar faria o inspetor não registrar nada.
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    if (!abrir || lista) return;
    fetch("/api/campo/equipamentos").then((r) => r.json())
      .then((j) => setLista(j.equipamentos || []))
      .catch(() => setLista([]));
  }, [abrir, lista]);

  const marcados = new Set(escolhidos.map((e) => e.id));
  const temVencido = escolhidos.some((e) => e.vencido);
  const doProc = tipo && !todos ? instrumentosDoTipo(lista || [], tipo) : (lista || []);
  const escondidos = (lista || []).length - doProc.length;

  const alternar = (eq) => {
    onMudar(marcados.has(eq.id) ? escolhidos.filter((x) => x.id !== eq.id) : [...escolhidos, eq]);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 mt-3">
      <div className="flex items-center gap-2 min-w-0">
        <Ruler size={16} className="text-torg-blue shrink-0" />
        <div className="min-w-0 flex-1">
          {escolhidos.length ? (
            <>
              <p className="text-[13px] font-semibold text-torg-dark leading-tight truncate">
                {escolhidos.map((e) => e.nome).join(" · ")}
              </p>
              <p className="text-[11px] text-torg-gray leading-tight">
                {escolhidos.length} instrumento(s) neste registro
              </p>
            </>
          ) : (
            <p className="text-sm text-torg-gray">Nenhum instrumento selecionado.</p>
          )}
        </div>
        <button onClick={() => setAbrir(true)} className="text-[12px] font-semibold text-torg-blue shrink-0 px-2 py-1">
          {escolhidos.length ? "trocar" : "escolher"}
        </button>
      </div>

      {temVencido && (
        <p className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Instrumento com calibração VENCIDA selecionado — o relatório vai registrar isso.
        </p>
      )}

      {abrir && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <header className="bg-torg-dark text-white px-4 py-3 flex items-center gap-3">
            <button onClick={() => setAbrir(false)} className="p-1 -ml-1"><ChevronLeft size={22} /></button>
            <p className="font-semibold flex-1">Instrumentos utilizados</p>
            <button onClick={() => setAbrir(false)} className="text-[13px] font-semibold px-2">pronto</button>
          </header>
          <div className="flex-1 overflow-y-auto">
            {lista === null && <p className="p-4 text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>}
            {lista && tipo && FONTE_POR_TIPO[tipo] && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-[12px] text-torg-gray">
                  {todos ? "Todos os instrumentos calibrados em dia." : `Previstos no procedimento — ${FONTE_POR_TIPO[tipo]}. Pode marcar mais de um.`}
                </p>
                {(escondidos > 0 || todos) && (
                  <button onClick={() => setTodos((v) => !v)} className="mt-1 text-[12px] font-semibold text-torg-blue">
                    {todos ? "só os do procedimento" : `ver todos (+${escondidos})`}
                  </button>
                )}
              </div>
            )}
            {doProc.map((eq) => {
              const on = marcados.has(eq.id);
              return (
                <button key={eq.id} onClick={() => alternar(eq)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 flex items-center gap-3 ${on ? "bg-torg-blue/5" : ""}`}>
                  <span className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center ${on ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>
                    {on && <Check size={13} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-torg-dark text-[13px] truncate">{eq.nome}</span>
                    <span className={`block text-[11px] ${eq.vencido ? "text-red-600 font-semibold" : "text-torg-gray"}`}>
                      {/* ⚠ só o certificado (Vitor, 22/08/2026). "VENCIDO" fica: não é uma data,
                          é um impedimento — instrumento fora de calibração invalida o ensaio. */}
                      {eq.certificado ? `cert ${eq.certificado}` : "sem certificado"}
                      {eq.vencido ? " · VENCIDO" : ""}
                    </span>
                  </span>
                </button>
              );
            })}
            {lista && !doProc.length && <p className="p-4 text-sm text-torg-gray">Nenhum instrumento previsto para este relatório.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function BuscarPeca({ opId, onEscolher, onFechar }) {
  const [q, setQ] = useState("");
  const [todas, setTodas] = useState(false);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    // espera o dedo parar antes de consultar — sem isso é uma consulta por letra digitada
    const t = setTimeout(() => {
      fetch(`/api/campo/pecas?opId=${opId}&q=${encodeURIComponent(q)}${todas ? "&todas=1" : ""}`)
        .then((r) => r.json())
        .then((j) => { if (vivo) setLista(j.pecas || []); })
        .catch(() => {})
        .finally(() => vivo && setCarregando(false));
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [opId, q, todas]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <header className="bg-torg-dark text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onFechar} className="p-1 -ml-1"><ChevronLeft size={22} /></button>
        <p className="font-semibold flex-1">Buscar peça</p>
      </header>
      <div className="p-4 border-b border-gray-100">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="marca da peça…"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          className="w-full text-base border border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none" />
        <label className="flex items-center gap-2 mt-2 text-[12px] text-torg-gray">
          {/* conjunto é o padrão: foto de inspeção quase sempre é do conjunto montado, e a OP tem
              três vezes mais croqui que conjunto — misturar faz rolar lista atrás do que se quer */}
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          incluir croquis e peças avulsas
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {carregando && <p className="p-4 text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> buscando…</p>}
        {!carregando && lista.map((p) => (
          <button key={p.marca} onClick={() => onEscolher(p.marca, "BUSCA")}
            className="w-full text-left px-4 py-3 border-b border-gray-50 active:bg-gray-50">
            <p className="font-semibold text-torg-dark">{p.marca}</p>
            <p className="text-[12px] text-torg-gray truncate">{[p.descricao, p.perfil].filter(Boolean).join(" · ") || "—"}</p>
          </button>
        ))}
        {!carregando && !lista.length && (
          <div className="p-4">
            <p className="text-sm text-torg-gray mb-3">Nada encontrado com esse nome.</p>
            {q.trim().length >= 2 && (
              // saída pra registro que não é peça da lista: região, eixo, vista geral
              <button onClick={() => onEscolher(q.trim().toUpperCase(), "LIVRE")}
                className="w-full border border-torg-blue text-torg-blue rounded-xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                <Check size={15} /> Usar &quot;{q.trim().toUpperCase()}&quot; assim mesmo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
