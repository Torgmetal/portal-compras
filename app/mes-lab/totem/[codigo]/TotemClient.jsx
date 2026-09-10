"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LogOut, Pause, Play, Search, Square, User } from "lucide-react";

// ─── O TOTEM DO OPERADOR ──────────────────────────────────────────────────────
//
// Três telas, uma de cada vez: CRACHÁ → ESCOLHER O TRABALHO → PRODUZINDO. Uma de cada vez é
// decisão: no chão de fábrica, com luva e pressa, tela com tudo ao mesmo tempo vira toque errado.
//
// ⚠⚠ A LISTA VEM DO GANTT — é o que o nosso MES faz e o Syneco não pode. O totem dele PERGUNTA
// qual marca o operador vai produzir; o nosso MOSTRA o que o PCP programou para este posto hoje.
// O leitor de código continua funcionando como atalho (Matheus, 10/09/2026: "os dois: lista +
// bipar"), e é a única saída quando não há programação — o que é o caso comum, não a exceção.
//
// ⚠ O leitor USB/Bluetooth EMULA TECLADO: digita o código e manda Enter. Por isso os campos são
// `<form>` com submit, e não botões — bipar já dispara sozinho.

const vazio = { boas: "", rejeitadas: "", retrabalho: "" };

export default function TotemClient({ codigo }) {
  const [dados, setDados] = useState(null);
  const [operador, setOperador] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState([]);
  const [qtd, setQtd] = useState(vazio);
  const [pedindoMotivo, setPedindoMotivo] = useState(false);

  // ⚠ UMA CHAVE POR TENTATIVA, trocada só depois do sucesso. É o padrão da Conferência de Peça
  // (`chave-operacao.js`): se a resposta se perder e o operador tocar de novo, chega a MESMA chave
  // e o servidor devolve o que já gravou em vez de gravar duas vezes.
  const chave = useRef(`t-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const novaChave = () => { chave.current = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`; };

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/mes-lab/totem/${encodeURIComponent(codigo)}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.success) return setErro(j.error);
      setDados(j);
      setErro("");
    } catch { setErro("Não consegui falar com o servidor."); }
  }, [codigo]);

  useEffect(() => { carregar(); }, [carregar]);

  async function agir(acao, corpo = {}) {
    if (!operador) return setErro("Bipe o crachá primeiro.");
    setOcupado(true);
    try {
      const r = await fetch(`/api/mes-lab/totem/${encodeURIComponent(codigo)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, cracha: operador.cracha, chaveOperacao: chave.current, ...corpo }),
      });
      const j = await r.json();
      if (!j.success) { setErro(j.error); return null; }
      novaChave();
      setErro("");
      await carregar();
      return j;
    } catch { setErro("Não consegui falar com o servidor."); return null; }
    finally { setOcupado(false); }
  }

  async function entrar(cracha) {
    setOcupado(true);
    try {
      const r = await fetch(`/api/mes-lab/totem/${encodeURIComponent(codigo)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "entrar", cracha }),
      });
      const j = await r.json();
      if (!j.success) return setErro(j.error);
      setOperador(j.operador);
      setErro("");
    } finally { setOcupado(false); }
  }

  if (!dados) return <Aguarde erro={erro} />;

  return (
    <div className="min-h-screen bg-torg-dark text-white p-5 md:p-8">
      <Cabecalho recurso={dados.recurso} operador={operador} estado={dados.estado}
                 aoSair={() => { setOperador(null); setQtd(vazio); }} />
      {erro && <Aviso texto={erro} />}

      {!operador && <PedirCracha aoEnviar={entrar} ocupado={ocupado} />}

      {operador && !dados.sessao && (
        <Escolher dados={dados} codigo={codigo} busca={busca} setBusca={setBusca}
                  ocupado={ocupado}
                  aoAbrir={(m) => agir("abrir", { marca: m.marca, opId: m.opId, opNumero: m.opNumero, planejadoQtd: m.qte })} />
      )}

      {operador && dados.sessao && (
        <Produzindo dados={dados} qtd={qtd} setQtd={setQtd} ocupado={ocupado}
                    aoApontar={async () => { if (await agir("apontar", { sessaoId: dados.sessao.id, ...numeros(qtd) })) setQtd(vazio); }}
                    aoParar={() => setPedindoMotivo(true)}
                    aoProduzir={() => agir("produzir", { sessaoId: dados.sessao.id })}
                    aoEncerrar={() => agir("encerrar", { sessaoId: dados.sessao.id })} />
      )}

      {pedindoMotivo && (
        <EscolherMotivo motivos={dados.motivos || []} ocupado={ocupado}
                        aoFechar={() => setPedindoMotivo(false)}
                        aoEscolher={async (m) => {
                          await agir("parar", { sessaoId: dados.sessao.id, motivoId: m.id });
                          setPedindoMotivo(false);
                        }} />
      )}
    </div>
  );
}

const numeros = (q) => ({
  boas: Number(q.boas) || 0, rejeitadas: Number(q.rejeitadas) || 0, retrabalho: Number(q.retrabalho) || 0,
});

const Aguarde = ({ erro }) => (
  <div className="min-h-screen bg-torg-dark text-white grid place-items-center p-8 text-center">
    {erro ? <p className="text-red-300 text-lg">{erro}</p> : <p className="text-white/60">Carregando o posto…</p>}
  </div>
);

const Aviso = ({ texto }) => (
  <div className="bg-red-500/15 border border-red-400/40 text-red-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
    <AlertCircle size={20} className="shrink-0 mt-0.5" /> <span className="text-lg">{texto}</span>
  </div>
);

// ⚠ O ESTADO É O ÚLTIMO EVENTO, e "sem evento" é DESCONHECIDO — não "parado". Conectividade é
// dimensão separada do estado produtivo (§7.3 do doc): máquina muda não é máquina parada, e pintar
// de vermelho o que ninguém sabe envenena o Pareto.
const CORES = { PRODUCAO: "bg-emerald-500", PARADA: "bg-red-500", SETUP: "bg-amber-500",
                RETRABALHO: "bg-orange-500", MANUTENCAO: "bg-sky-500", FORA_TURNO: "bg-gray-500" };

function Cabecalho({ recurso, operador, estado, aoSair }) {
  return (
    <header className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
      <div>
        <p className="text-xs uppercase tracking-widest text-white/50">{recurso.setor.nome}</p>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">{recurso.nome}</h1>
        <p className="text-white/40 text-sm">{recurso.codigo}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-sm">
          <span className={`w-3 h-3 rounded-full ${CORES[estado] || "bg-white/25"}`} />
          {estado || "sem registro"}
        </span>
        {operador && (
          <button onClick={aoSair} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2">
            <User size={18} /> <span className="hidden md:inline">{operador.nome.split(" ")[0]}</span> <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  );
}

function PedirCracha({ aoEnviar, ocupado }) {
  const [valor, setValor] = useState("");
  const campo = useRef(null);
  useEffect(() => { campo.current?.focus(); }, []);
  return (
    <form className="max-w-lg mx-auto text-center pt-10"
          onSubmit={(e) => { e.preventDefault(); aoEnviar(valor.trim()); setValor(""); }}>
      <h2 className="text-2xl mb-6 text-white/80">Bipe o seu crachá</h2>
      <input ref={campo} value={valor} onChange={(e) => setValor(e.target.value)} disabled={ocupado}
             className="w-full text-center text-4xl tracking-[0.3em] bg-white/10 rounded-2xl px-6 py-6 outline-none focus:ring-4 ring-torg-blue/60"
             placeholder="• • • •" autoComplete="off" />
      <p className="text-white/40 text-sm mt-4">Ou digite a matrícula e aperte Enter.</p>
    </form>
  );
}

function Escolher({ dados, codigo, busca, setBusca, aoAbrir, ocupado }) {
  const [termo, setTermo] = useState("");
  async function procurar(e) {
    e.preventDefault();
    const r = await fetch(`/api/mes-lab/totem/${encodeURIComponent(codigo)}?buscar=${encodeURIComponent(termo)}`);
    const j = await r.json();
    setBusca(j.marcas || []);
  }
  const temProgramacao = dados.lotes?.length > 0;

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={procurar} className="flex gap-2 mb-6">
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Bipe ou digite a marca"
               className="flex-1 bg-white/10 rounded-xl px-5 py-4 text-xl outline-none focus:ring-2 ring-torg-blue/60" autoComplete="off" />
        <button className="bg-white/10 hover:bg-white/20 rounded-xl px-5"><Search size={22} /></button>
      </form>

      {busca.length > 0 && (
        <Secao titulo="Encontradas">
          {busca.map((m) => <Cartao key={m.id} m={m} onClick={() => aoAbrir(m)} ocupado={ocupado} />)}
        </Secao>
      )}

      {temProgramacao ? dados.lotes.map((lote) => (
        <Secao key={lote.opNumero} titulo={`Obra ${lote.opNumero}`}
               nota={`${lote.marcas.length} marca(s) · ${lote.pecas} peça(s) · ${Math.round(lote.kg)} kg`}>
          {lote.marcas.map((m) => <Cartao key={m.id} m={{ ...m, opNumero: lote.opNumero, opId: lote.opId }}
                                          onClick={() => aoAbrir({ ...m, opNumero: lote.opNumero, opId: lote.opId })} ocupado={ocupado} />)}
        </Secao>
      )) : (
        // ⚠ SEM PROGRAMAÇÃO É O CASO COMUM, e a tela diz isso sem parecer defeito. O Gantt programa
        // o horizonte próximo; a maioria dos postos, na maioria dos dias, não está nele.
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <p className="text-xl text-white/70 mb-1">Nada programado para este posto hoje.</p>
          <p className="text-white/40">Bipe a marca que você vai produzir no campo acima.</p>
        </div>
      )}
    </div>
  );
}

const Secao = ({ titulo, nota, children }) => (
  <section className="mb-6">
    <h3 className="text-xs uppercase tracking-widest text-white/50 mb-2">
      {titulo} {nota && <span className="normal-case tracking-normal text-white/35">— {nota}</span>}
    </h3>
    <div className="grid gap-2">{children}</div>
  </section>
);

const Cartao = ({ m, onClick, ocupado }) => (
  <button onClick={onClick} disabled={ocupado}
          className="w-full text-left bg-white/8 hover:bg-white/15 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between gap-4 disabled:opacity-50">
    <span>
      <span className="block text-2xl font-bold leading-tight">{m.marca}</span>
      <span className="block text-white/50 text-sm">{m.descricao || "—"}</span>
    </span>
    <span className="text-right shrink-0">
      <span className="block text-xl font-semibold">{m.qte} pç</span>
      <span className="block text-white/40 text-sm">{Math.round(m.kg || 0)} kg</span>
    </span>
  </button>
);

function Produzindo({ dados, qtd, setQtd, aoApontar, aoParar, aoProduzir, aoEncerrar, ocupado }) {
  const { sessao, apontado, estado } = dados;
  const parado = estado === "PARADA";
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white/8 border border-white/10 rounded-2xl p-6 mb-5">
        <p className="text-white/50 text-sm uppercase tracking-widest">Produzindo</p>
        <p className="text-4xl md:text-5xl font-bold leading-tight">{sessao.marca || "—"}</p>
        <p className="text-white/50">Obra {sessao.opNumero || "—"} · planejado {sessao.planejadoQtd || 0} pç</p>
        <div className="flex gap-6 mt-4 text-lg">
          <Contador rotulo="Boas" valor={apontado?.boas} destaque />
          <Contador rotulo="Rejeitadas" valor={apontado?.rejeitadas} />
          <Contador rotulo="Retrabalho" valor={apontado?.retrabalho} />
        </div>
      </div>

      <div className="bg-white/8 border border-white/10 rounded-2xl p-6 mb-5">
        <p className="text-white/60 mb-3">Apontar quantidade</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[["boas", "Boas"], ["rejeitadas", "Rejeitadas"], ["retrabalho", "Retrabalho"]].map(([k, r]) => (
            <label key={k} className="block">
              <span className="block text-white/45 text-sm mb-1">{r}</span>
              <input inputMode="numeric" value={qtd[k]} onChange={(e) => setQtd({ ...qtd, [k]: e.target.value })}
                     className="w-full bg-white/10 rounded-xl px-4 py-4 text-2xl text-center outline-none focus:ring-2 ring-torg-blue/60" placeholder="0" />
            </label>
          ))}
        </div>
        <button onClick={aoApontar} disabled={ocupado}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl py-5 text-xl font-bold flex items-center justify-center gap-2">
          <CheckCircle2 size={24} /> Lançar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {parado ? (
          <Botao cor="bg-emerald-600 hover:bg-emerald-500" onClick={aoProduzir} ocupado={ocupado}><Play size={22} /> Retomar</Botao>
        ) : (
          <Botao cor="bg-red-600 hover:bg-red-500" onClick={aoParar} ocupado={ocupado}><Pause size={22} /> Parada</Botao>
        )}
        <Botao cor="bg-white/10 hover:bg-white/20" onClick={aoEncerrar} ocupado={ocupado}><Square size={20} /> Encerrar</Botao>
      </div>
    </div>
  );
}

/**
 * ⚠⚠ PARADA SEM MOTIVO NÃO EXISTE, E O BOTÃO NÃO PODE FINGIR QUE SIM. A primeira versão desta tela
 * mandava `motivoId: null` — e `mudarEstado` recusa parada sem motivo, então o botão vermelho
 * falharia SEMPRE, com uma mensagem que o operador não teria como resolver. Perguntar é o que
 * transforma a barra vermelha do monitor em Pareto: sem o motivo, sabe-se que parou e nunca por quê.
 *
 * ⚠ Os planejados vêm marcados porque não são o mesmo tipo de parada: refeição e setup TIRAM do
 * tempo planejado, em vez de contar contra a Disponibilidade. Quem escolhe precisa ver a diferença.
 */
function EscolherMotivo({ motivos, aoEscolher, aoFechar, ocupado }) {
  return (
    <div className="fixed inset-0 bg-black/70 grid place-items-center p-5 z-50" onClick={aoFechar}>
      <div className="bg-torg-dark border border-white/15 rounded-2xl p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-2xl font-bold mb-1">Por que a máquina parou?</h3>
        <p className="text-white/45 mb-5">A parada só é registrada com o motivo.</p>
        <div className="grid md:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto">
          {motivos.map((m) => (
            <button key={m.id} disabled={ocupado} onClick={() => aoEscolher(m)}
                    className="text-left bg-white/8 hover:bg-white/16 border border-white/10 rounded-xl px-4 py-4 text-lg disabled:opacity-50">
              {m.descricao}
              {m.planejada && <span className="block text-white/40 text-xs mt-0.5">parada planejada</span>}
            </button>
          ))}
          {!motivos.length && <p className="text-white/50 col-span-full">Nenhum motivo cadastrado.</p>}
        </div>
        <button onClick={aoFechar} className="mt-5 w-full bg-white/10 hover:bg-white/20 rounded-xl py-4 text-lg">
          Voltar
        </button>
      </div>
    </div>
  );
}

const Contador = ({ rotulo, valor, destaque }) => (
  <span>
    <span className="block text-white/45 text-xs uppercase tracking-wide">{rotulo}</span>
    <span className={`block font-bold ${destaque ? "text-3xl text-emerald-400" : "text-2xl text-white/80"}`}>{valor ?? 0}</span>
  </span>
);

const Botao = ({ cor, onClick, ocupado, children }) => (
  <button onClick={onClick} disabled={ocupado}
          className={`${cor} disabled:opacity-50 rounded-xl py-5 text-xl font-bold flex items-center justify-center gap-2`}>
    {children}
  </button>
);
