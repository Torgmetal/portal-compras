"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, LogOut, User } from "lucide-react";
import { visualDo } from "./estado-visual";
import Produzindo from "./Produzindo";
import Trabalhos from "./Trabalhos";
import EscolherPlano from "./EscolherPlano";
import PedirCracha from "./PedirCracha";
import Escolher from "./Escolher";
import EscolherMotivo from "./EscolherMotivo";

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

// ⚠⚠ `produzidas` NA TELA, `boas` NO BANCO. Matheus (11/09/2026): "remova o Boas, coloque algo
// como Produzidas; e rejeitadas pode remover esse campo". A coluna `boas` continua com o nome
// antigo no schema — renomeá-la exigiria migração e reescreveria o histórico já importado do
// Syneco por nada. `numeros()` faz a tradução num lugar só.
//
// ⚠ REJEITADAS SAIU DA TELA, NÃO DO BANCO. A coluna fica: o histórico importado tem valores nela,
// e apagá-la para tirar um campo da tela perderia dado que já existe. O totem passa a mandar zero.
const vazio = { produzidas: "", retrabalho: "" };

export default function TotemClient({ codigo }) {
  const [dados, setDados] = useState(null);
  // ⚠⚠ `operador.presencaId` É O ID DO VÍNCULO DE CRACHÁ, e ele viaja em TODO comando. É o que
  // impede uma aba esquecida, aberta desde antes de uma liberação, de voltar a funcionar sozinha
  // quando o operador reentrar no mesmo posto (pedido do Codex): o servidor compara com o vínculo
  // ativo e recusa o que é velho. Mora junto do operador porque nasce e morre com ele.
  const [operador, setOperador] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState([]);
  const [qtd, setQtd] = useState(vazio);
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [feito, setFeito] = useState("");
  // ⚠ Qual das marcas abertas o operador está lançando. Com uma só, não é usada — ela entra direto.
  const [selecionada, setSelecionada] = useState(null);

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
        body: JSON.stringify({ acao, cracha: operador.cracha, presencaId: operador.presencaId ?? null, chaveOperacao: chave.current, ...corpo }),
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

  /**
   * Lança a quantidade e, se a marca fechou, ENCERRA a sessão e volta para a lista.
   *
   * ⚠⚠ QUEM DIZ QUE FECHOU É O SERVIDOR (`concluiu`), não a tela. O saldo que o navegador tem é de
   * alguns segundos atrás; decidindo aqui, dois totens na mesma marca encerrariam a sessão um do
   * outro — ou nenhum encerraria.
   *
   * ⚠ VOLTA PARA A LISTA, NÃO PULA PARA A PRÓXIMA MARCA. Abrir a próxima sozinho gravaria um evento
   * de PRODUÇÃO numa máquina que pode estar parada (o operador foi almoçar, buscar a chapa) — tempo
   * produtivo que ninguém viveu, exatamente o que envenena o OEE. O próximo passo é um toque, e é
   * do operador.
   */
  async function apontar(sessao) {
    const r = await agir("apontar", { sessaoId: sessao.id, ...numeros(qtd) });
    if (!r) return;
    setQtd(vazio);
    if (!r.concluiu) return;
    await agir("encerrar", { sessaoId: sessao.id });
    setFeito(avisoDeConclusao(sessao, r.saldo));
  }

  async function entrar(cracha) {
    setOcupado(true);
    try {
      const r = await fetch(`/api/mes-lab/totem/${encodeURIComponent(codigo)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "entrar", cracha }),
      });
      const j = await r.json();
      // ⚠ A RECUSA POR CRACHÁ ABERTO EM OUTRO POSTO CHEGA AQUI, e a mensagem do servidor já diz
      // ONDE ele está e quantas marcas faltam encerrar. A tela não inventa texto: quem sabe o que
      // está aberto é o banco, não o navegador.
      if (!j.success) return setErro(j.error);
      setOperador({ ...j.operador, presencaId: j.presencaId ?? null });
      setErro(j.liberou ? `O seu crachá foi liberado de ${j.liberou} — aquele posto estava sem marca aberta.` : "");
    } finally { setOcupado(false); }
  }

  if (!dados) return <Aguarde erro={erro} />;

  const linkDasBancadas = bancadasDoSetor(dados.recurso);
  const { abertos, atual, emProducao, escolhendoMarca, escolhendoTrabalho } =
    qualTela(dados, operador, selecionada);

  return (
    <div className="min-h-screen bg-torg-dark text-white p-5 md:p-8">
      {/* ⚠⚠ SAIR É UMA AÇÃO NO SERVIDOR, não um `setOperador(null)`. Enquanto era só estado da
          tela, o operador largava o posto com a barra aberta e bipava na máquina ao lado — que é
          exatamente o que o Matheus pediu para impedir. O servidor recusa a saída com marca aberta
          e diz o que falta encerrar.

          ⚠ Recusada a saída, o operador CONTINUA na tela: jogá-lo para fora com o crachá ainda
          preso seria o pior dos dois mundos — ele perderia a tela de onde consegue encerrar. */}
      <Cabecalho recurso={dados.recurso} operador={operador} estado={dados.estado}
                 aoSair={async () => {
                   if (!await agir("sair")) return;
                   setOperador(null); setQtd(vazio); setSelecionada(null);
                 }} />
      {erro && <Aviso texto={erro} />}
      {feito && <Concluida texto={feito} />}

      {!operador && <PedirCracha aoEnviar={entrar} ocupado={ocupado} voltarPara={linkDasBancadas} />}

      {escolhendoTrabalho && (
        <Trabalhos trabalhos={abertos} ocupado={ocupado}
                   aoEscolher={(id) => { setFeito(""); setSelecionada(id); }}
                   aoEncerrarLote={async (lote) => {
                     const r = await agir("encerrarLote", { loteId: lote });
                     if (r?.success) setFeito(`Barra encerrada — ${r.encerradas} marca(s).`);
                   }} />
      )}

      {escolhendoMarca && (
        <>
          <EscolherPlano planos={dados.planos || []} ocupado={ocupado}
                         aoAbrir={async (u) => {
                           setFeito("");
                           const r = await agir("abrirNesting", { unidadeId: u.id, chaveOperacao: chaveDaAbertura(u) });
                           if (r?.success) setFeito(`Barra ${u.indice} aberta — ${r.sessoes?.length} marcas.`);
                         }} />
        <Escolher dados={dados} codigo={codigo} busca={busca} setBusca={setBusca}
                  ocupado={ocupado}
                  aoAbrir={(m) => { setFeito(""); return agir("abrir", { marca: m.marca, opId: m.opId, opNumero: m.opNumero, planejadoQtd: m.qte }); }} />
        </>
      )}

      {emProducao && (
        <>
          {/* ⚠ Com várias marcas abertas, a volta para a lista precisa existir e ser óbvia: sem
              ela, quem escolhe a marca errada fica preso nela. */}
          {abertos.length > 1 ? (
            <button onClick={() => setSelecionada(null)}
                    className="max-w-4xl mx-auto mb-4 flex items-center gap-2 text-white/60 hover:text-white">
              <ArrowLeft size={20} /> <span className="text-lg">as {abertos.length} marcas do posto</span>
            </button>
          ) : null}
          <Produzindo dados={{ ...dados, sessao: atual.sessao, apontado: atual.apontado, saldo: atual.saldo }}
                      qtd={qtd} setQtd={setQtd} ocupado={ocupado}
                      aoApontar={() => apontar(atual.sessao)}
                      aoParar={() => setPedindoMotivo(true)}
                      aoProduzir={() => agir("produzir", { sessaoId: atual.sessao.id })}
                      aoEncerrar={() => agir("encerrar", { sessaoId: atual.sessao.id })} />
        </>
      )}

      {pedindoMotivo && (
        <EscolherMotivo motivos={dados.motivos || []} ocupado={ocupado}
                        aoFechar={() => setPedindoMotivo(false)}
                        aoEscolher={async (m) => {
                          await agir("parar", { sessaoId: atual.sessao.id, motivoId: m.id });
                          setPedindoMotivo(false);
                        }} />
      )}
    </div>
  );
}

/**
 * ⚠ O DESTINO DA VOLTA É O SETOR DO PRÓPRIO POSTO, nunca a lista da fábrica inteira: o PC da
 * montagem tem de voltar para as bancadas da montagem, e não para uma tela que oferece o laser.
 */
const bancadasDoSetor = (recurso) =>
  recurso?.setor?.codigo ? `/mes-lab/totem/setor/${encodeURIComponent(recurso.setor.codigo)}` : null;

const avisoDeConclusao = (sessao, saldo) =>
  `${sessao.marca} concluída — ${saldo?.boas ?? "?"} de ${saldo?.planejado ?? "?"} peças.`;

/**
 * ⚠⚠ A CHAVE DE ABERTURA É DA BARRA, NÃO DO TOQUE. Se a resposta se perder e o operador tocar de
 * novo, a MESMA chave chega e o servidor devolve o lote que já existe, em vez de abrir a barra duas
 * vezes. Mesma ideia da chave por tentativa do lançamento, mas aqui a identidade é a barra.
 */
const chaveDaAbertura = (u) => `nest-${u.id}`;

/**
 * Qual das telas mostrar.
 *
 * ⚠⚠ COM UMA MARCA SÓ, NADA MUDA — o operador entra direto no lançamento, como sempre foi. A lista
 * existe para o caso novo (a barra do nesting, com várias marcas); obrigar um toque a mais em quem
 * tem uma só seria cobrar pelo que ele não pediu.
 */
function qualTela(dados, operador, selecionada) {
  const abertos = dados.trabalhos || [];
  const atual = abertos.length === 1 ? abertos[0] : abertos.find((t) => t.sessao.id === selecionada);
  return {
    abertos, atual,
    emProducao: Boolean(operador && atual),
    escolhendoMarca: Boolean(operador && !abertos.length),
    escolhendoTrabalho: Boolean(operador && abertos.length > 1 && !atual),
  };
}

const numeros = (q) => ({
  boas: Number(q.produzidas) || 0, rejeitadas: 0, retrabalho: Number(q.retrabalho) || 0,
});

const Aguarde = ({ erro }) => (
  <div className="min-h-screen bg-torg-dark text-white grid place-items-center p-8 text-center">
    {erro ? <p className="text-red-300 text-lg">{erro}</p> : <p className="text-white/60">Carregando o posto…</p>}
  </div>
);

/**
 * ⚠ O FIM DA MARCA PRECISA DE CONFIRMAÇÃO VISÍVEL. Sem ela, o operador lança a última peça e a tela
 * simplesmente volta para a lista — e "voltou sozinho" se parece com "deu erro e perdeu o que eu
 * digitei". Verde, com o número, para ele conferir sem perguntar a ninguém.
 */
const Concluida = ({ texto }) => (
  <div className="bg-emerald-500/20 border border-emerald-400/50 text-emerald-100 rounded-xl px-4 py-4 mb-5 flex items-start gap-3">
    <CheckCircle2 size={24} className="shrink-0 mt-0.5" /> <span className="text-xl font-semibold">{texto}</span>
  </div>
);

const Aviso = ({ texto }) => (
  <div className="bg-red-500/15 border border-red-400/40 text-red-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
    <AlertCircle size={20} className="shrink-0 mt-0.5" /> <span className="text-lg">{texto}</span>
  </div>
);

// ⚠⚠ O ESTADO TEM UMA FONTE SÓ (`FaixaEstado.jsx`). Antes eram duas — uma tabela de cores aqui e um
// rótulo fixo no card da sessão — e foi assim que a tela passou a dizer "PRODUZINDO" com a máquina
// parada. Cor e palavra saem do mesmo lugar agora, e o cabeçalho mostra o rótulo legível
// ("PARADO"), não o nome do enum ("PARADA").

function Cabecalho({ recurso, operador, estado, aoSair }) {
  return (
    <header className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
      <div>
        <p className="text-xs uppercase tracking-widest text-white/50">{recurso.setor.nome}</p>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">{recurso.nome}</h1>
        <p className="text-white/40 text-sm">{recurso.codigo}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <span className={`w-3 h-3 rounded-full ${visualDo(estado).fundo}`} />
          {visualDo(estado).rotulo}
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
