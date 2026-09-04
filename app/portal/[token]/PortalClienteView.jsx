"use client";
import { useEffect, useState } from "react";
import {
  Loader2, AlertCircle, ShieldCheck, CalendarRange, FileText, Award,
  BookCheck, Layers, Image as ImageIcon, ChevronRight, ChevronDown,
  Download, Package, ShoppingCart, Truck, Check, FileSpreadsheet, History,
  FolderOpen, Box,
} from "lucide-react";
import { AREAS, SECOES, SECAO } from "@/lib/portal-cliente";
import ModeloObraCliente from "./ModeloObraCliente";
import TorguinhoCliente from "./TorguinhoCliente";
import MatrizComunicacao from "./MatrizComunicacao";
import SeloSetembroAmarelo from "@/components/SeloSetembroAmarelo";

const AREA_NOME = Object.fromEntries(AREAS.map((a) => [a.id, a.nome]));
const AREA_RESUMO = Object.fromEntries(AREAS.map((a) => [a.id, a.resumo]));

// ─── O PORTAL DA OBRA, PELO LADO DO CLIENTE ───────────────────────────────────
// Vitor (22/08/2026): "precisa ser um portal com a melhor arte que acharmos... uma
// mensagem forte de agradecimento e parceria, mostrando o lado de preocupação que
// carregamos em atender os mais altos padrões de qualidade e atendimento".
//
// A decisão de desenho: ESTE É UM DOCUMENTO, NÃO UM APLICATIVO. Quem abre é um gerente
// de obra ou um fiscal, muitas vezes no celular, no canteiro, com pressa. Então nada de
// menu lateral, abas ou navegação em camadas — uma página só, que se lê rolando, com a
// mesma identidade do documento impresso que ele já recebe da Torg: navy, filete
// laranja, tipografia grande e ar entre os blocos.
//
// ⚠ E O NÚMERO VEM ANTES DO ADJETIVO. "Alto padrão de qualidade" é o que todo fornecedor
// escreve; "412 certificados de matéria-prima com corrida rastreada" é o que prova. Por
// isso o topo mostra a contagem real do que a obra tem, e não uma frase de efeito.

const fmtD = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR")} kg`;
const fmtMB = (b) => (!b ? "—" : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default function PortalClienteView({ token }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState(null);
  // ⚠ O CÓDIGO DA PESSOA VIAJA JUNTO. O `?d=` chega na URL do e-mail; se ele não for repassado nas
  // chamadas seguintes, só a ABERTURA saberia quem é e todo download voltaria a ser anônimo — que
  // é justamente a metade da pergunta do Vitor ("o que foi aberto e feito download").
  const cod = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("d") : null;
  const comCod = (u) => (cod ? `${u}${u.includes("?") ? "&" : "?"}d=${encodeURIComponent(cod)}` : u);
  // ⚠ o "ver como o cliente vê" abre esta mesma página com ?preview=1 — a rota então não conta
  // acesso nem tira foto de revisão em nome de um cliente que não entrou.
  const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";

  useEffect(() => {
    const url = new URL(`/api/portal/${token}`, window.location.origin);
    if (cod) url.searchParams.set("d", cod);
    if (preview) url.searchParams.set("preview", "1");
    fetch(url.pathname + url.search)
      .then((r) => r.json())
      .then((j) => (j.error ? setErro(j.error) : setD(j)))
      .catch(() => setErro("Não consegui carregar o portal."));
  }, [token]);

  if (erro) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md text-center">
          <AlertCircle size={30} className="mx-auto text-red-500 mb-3" />
          <p className="text-[15px] text-gray-700">{erro}</p>
        </div>
      </main>
    );
  }
  if (!d) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#006EAB]" size={30} />
      </main>
    );
  }

  const { op, portal, dados } = d;
  const tem = (s) => portal.secoes.includes(s);

  // ⚠⚠ ABAS POR ÁREA DA OBRA. Vitor (26/08/2026): "preciso que separe abas por áreas da obra:
  // Engenharia, Compras, Planejamento, Qualidade e Expedição — em cada aba teremos documentos
  // relacionados a isso".
  //
  // Antes era uma página só, com nove blocos empilhados na ordem do processo. Funcionava para quem
  // lia de cima a baixo; não funciona para quem entra atrás de UMA coisa — e é assim que o cliente
  // volta ao portal depois da primeira visita.
  //
  // ⚠ ABA SEM CONTEÚDO NÃO APARECE: "Compras (0)" faz o cliente clicar para não achar nada, e a
  // primeira impressão é justamente o que ele quer proteger.
  const conteudo = {
    // ⚠⚠ LISTA VAZIA NÃO É LISTA. A OP-112 mostrava "Lista de produção (LPC) · 0 itens" com o
    // botão "Baixar planilha" ao lado — o cliente clicava e recebia uma planilha em branco, o que é
    // pior que não ter a seção. A causa era simples e ficou invisível: a Engenharia não tinha
    // importado a LPC daquela obra (Vitor descobriu em 26/08/2026). Sem itens, a seção não aparece;
    // quem publica vê o aviso na configuração do portal.
    LPC: tem("LPC") && dados.lpc?.itens?.length > 0,
    LE: tem("LE") && dados.le?.itens?.length > 0,
    COMPRAS: tem("COMPRAS") && dados.compras?.itens?.length > 0,
    CRONOGRAMA: tem("CRONOGRAMA") && !!dados.cronograma,
    CERTIFICADOS: tem("CERTIFICADOS") && dados.certificados?.length > 0,
    RELATORIOS: tem("RELATORIOS") && dados.relatorios?.length > 0,
    DATABOOK: tem("DATABOOK") && dados.databook?.volumes?.length > 0,
    DOCUMENTOS: tem("DOCUMENTOS") && dados.documentos?.length > 0,
    PLANOS: tem("PLANOS") && (dados.planos?.length > 0 || !!dados.planosAceite),
    FOTOS: tem("FOTOS") && portal.fotos?.length > 0,
    // ⚠ estes dois não dependem de dado carregado aqui: o modelo e o assistente buscam por conta
    // própria (e o modelo some sozinho se a obra não tiver IFC publicado). Ligou a seção, a aba
    // existe — senão a aba "Modelo 3D" nasceria escondida justamente na obra que acabou de ligá-la.
    MODELO_NAVEGAVEL: tem("MODELO_NAVEGAVEL"),
    // ⚠ o Torguinho NÃO é conteúdo de aba: ele flutua no canto da página inteira (ver
    // TorguinhoCliente). Marcar como conteúdo faria a aba "Modelo 3D" existir só por causa dele,
    // numa obra que nem publicou modelo.
    ASSISTENTE: false,
  };
  const secoesDaArea = (a) => {
    const base = SECOES.filter((x) => x.area === a && conteudo[x.id]);
    // ⚠ os documentos escolhidos da 2.5.5 não são uma "seção" configurável — são conteúdo da
    // Engenharia. Sem contá-los, uma obra que só publicou desenhos não teria a aba.
    if (dados.docsPorArea?.[a]?.length && tem("DOCUMENTOS")) {
      return base.length ? base : [{ id: "DOCS_AREA", area: a }];
    }
    return base;
  };
  const areasComConteudo = AREAS.filter((a) => secoesDaArea(a.id).length > 0);
  // ⚠⚠ A PRIMEIRA ABA É "FALE COM A TORG" (Vitor, 28/08/2026). Ela não depende de conteúdo
  // publicado: existe em toda obra, inclusive na que acabou de abrir o portal — e é o que o cliente
  // procura primeiro quando algo trava. As outras abas continuam aparecendo só quando têm o que
  // mostrar. Ver lib/matriz-comunicacao.js.
  const abas = [{ id: "CONTATO", nome: "Fale com a Torg", resumo: "Quem atende o seu projeto em cada assunto." }, ...areasComConteudo];
  const abaAtiva = abas.some((a) => a.id === aba) ? aba : abas[0].id;
  const mostrar = (id) => conteudo[id] && SECAO[id]?.area === abaAtiva;

  // os números que sustentam a mensagem — só entram os que existem de verdade
  const numeros = [
    // ⚠ contagem de certificado NAO entra aqui. Vitor (22/08/2026), apontando o "23 certificados
    // de material" na capa: "tire essa informação". Numero de certificado na capa vira promessa
    // — o cliente le como "a obra tem 23" e cobra os 23; e o que existe hoje e o que ja foi
    // emitido, que cresce enquanto a obra anda. A seção de Certificados mostra a lista real.
    dados.relatorios?.length && { v: dados.relatorios.length, r: "relatórios de inspeção aprovados" },
    dados.lpc?.totalConjuntos && { v: dados.lpc.totalConjuntos, r: "conjuntos fabricados" },
    // ⚠⚠ O PESO NÃO ENTRA NA CAPA. Vitor (04/09/2026), apontando o "16.555 kg de estrutura":
    // "precisa tirar essa informação da página do cliente". Mesmo motivo do número de certificados
    // que saiu antes: número na capa vira compromisso. O peso da LPC é o que a lista tem HOJE — ele
    // muda a cada revisão de projeto, e o cliente lê como o peso contratado da obra.
    // O peso continua onde ele significa alguma coisa: nas seções que dizem de onde o número veio.
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#0D1F3C]">
      {/* ── CAPA ─────────────────────────────────────────────────────────── */}
      <header className="relative bg-[#0D1F3C] text-white overflow-hidden">
        {portal.capaUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portal.capaUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.28]" />
            {/* ⚠ o degradê existe para o TEXTO, não para a foto: sem ele o nome da obra briga com
                o que estiver na imagem e fica ilegível justamente na primeira tela. */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D1F3C] via-[#0D1F3C]/90 to-[#0D1F3C]/55" />
          </>
        )}
        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 pt-14 pb-16">
          {/* ── AS DUAS MARCAS, LADO A LADO ───────────────────────────────────────────────
              Vitor (22/08/2026): "quero que tenha o logo da Torg e logo do cliente".

              ⚠ Não é enfeite: o portal é o documento de uma PARCERIA. Página que carrega só a
              marca de quem fabrica parece propaganda; com as duas, parece o que é — prestação de
              contas de um trabalho feito a quatro mãos.

              ⚠ O logo do cliente vem em FUNDO CLARO. Marca de cliente costuma ser colorida e
              sumiria no navy; a lâmina branca garante que ela apareça como ela é, em vez de a
              gente "adaptar" a marca dos outros. */}
          {/* ⚠ TAMANHO DA MARCA. Vitor (22/08/2026): "aumente a projeção do logo da Torg para
              ficar mais visível" — no navy da capa, a marca em h-9 sumia. As duas crescem JUNTAS:
              encolher a do cliente pra destacar a nossa contradiz o motivo delas estarem lado a
              lado. A sombra é pra capa com foto clara no topo, onde o logo branco encostava no céu. */}
          {/* ⚠ o selo do Setembro Amarelo entra NESTA linha, não numa própria: Vitor pediu
              "posicionado correto, igual ao nosso logo" — mesma altura das marcas, encostado à
              direita. Linha separada faria ele flutuar acima do logo e desalinhar o cabeçalho. */}
          <div className="flex items-center gap-6 mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torg-logo-white.png" alt="Torg Metal" className="h-14 sm:h-[72px] w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
            {portal.logoClienteUrl && (
              <>
                <span className="h-12 sm:h-16 w-px bg-white/25" />
                <span className="bg-white rounded-xl px-4 py-3 inline-flex items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={portal.logoClienteUrl} alt={op.cliente || "Cliente"} className="h-10 sm:h-12 w-auto object-contain"
                    onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
                </span>
              </>
            )}
            <SeloSetembroAmarelo className="ml-auto" />
          </div>

          <p className="text-[11px] tracking-[0.22em] font-semibold text-[#9fc0dd] uppercase">
            Portal da obra
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold mt-2 leading-[1.08]">
            {op.obra || `OP-${String(op.numero).padStart(3, "0")}`}
          </h1>
          <p className="text-[15px] sm:text-lg text-[#cfe0ef] mt-3">
            {op.cliente}
            {op.refCliente ? <span className="text-[#9fc0dd]"> · {op.refCliente}</span> : null}
          </p>

          <div className="h-[3px] w-24 bg-[#F4801F] rounded-full mt-7" />

          {numeros.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 mt-9">
              {numeros.map((n, i) => (
                <div key={i}>
                  <p className="text-2xl sm:text-3xl font-extrabold tabular-nums">{n.v}</p>
                  <p className="text-[11px] text-[#9fc0dd] leading-tight mt-0.5">{n.r}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── A MENSAGEM ───────────────────────────────────────────────────── */}
      {/* ⚠ vem ANTES dos dados, e não como rodapé: é o que dá sentido ao resto. */}
      <section className="max-w-3xl mx-auto px-6 sm:px-8 -mt-8 relative">
        <div className="bg-white rounded-2xl shadow-[0_2px_24px_rgba(13,31,60,0.08)] border border-gray-100 p-7 sm:p-9">
          <div className="flex items-center gap-2 text-[#006EAB] mb-4">
            <ShieldCheck size={17} />
            <span className="text-[11px] font-bold tracking-[0.14em] uppercase">Torg Metal · ISO 9001</span>
          </div>
          <div className="text-[15px] leading-[1.75] text-gray-700 whitespace-pre-line">
            {portal.mensagem}
          </div>
          {portal.contato && (
            <p className="text-[13px] text-gray-500 mt-6 pt-5 border-t border-gray-100">
              Preparado para <strong className="text-[#0D1F3C]">{portal.contato}</strong>
              {portal.empresa ? ` · ${portal.empresa}` : ""}
            </p>
          )}
        </div>
      </section>

      {/* ── O QUE MUDOU NAS LISTAS ────────────────────────────────────────
          Vitor (22/08/2026): "deixar com um alerta quando ele entrar para saber o que mudou".

          ⚠ O AVISO FICA AQUI FORA, e não dentro do bloco da lista: os blocos abrem fechados, e
          um alerta que só aparece depois de dois cliques não é alerta. Uma revisão de lista é a
          notícia mais importante que o portal pode dar — é ela que muda o que o cliente vai
          receber. */}
      <AvisoDeRevisao token={token} listas={[
        dados.lpc?.revisao && { fonte: "LPC", titulo: "Lista de produção (LPC)", rev: dados.lpc.revisao },
        dados.le?.revisao && { fonte: "LE", titulo: "Lista de expedição (LE)", rev: dados.le.revisao },
      ].filter(Boolean)} />

      {/* ── as áreas da obra ── */}
      {abas.length > 1 && (
        <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 flex gap-1 overflow-x-auto">
            {/* ⚠ SEM CONTADOR. Ele contava SEÇÕES, não documentos — dava "1" em quase toda aba, o
                que não informa nada e ainda sugere que a obra tem um documento só. Um número que
                não ajuda a decidir onde clicar é ruído na primeira coisa que o cliente vê. */}
            {abas.map((a) => {
              const on = a.id === abaAtiva;
              return (
                <button key={a.id} onClick={() => setAba(a.id)} title={a.resumo}
                  className={`whitespace-nowrap px-4 py-3.5 text-[13px] font-semibold border-b-[3px] transition-colors ${
                    on ? "border-[#F4801F] text-[#0D1F3C]" : "border-transparent text-gray-500 hover:text-[#0D1F3C]"}`}>
                  {a.nome}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14 space-y-12">
        {/* ⚠ o resumo da área abre a aba: o cliente que clicou em "Qualidade" tem de saber o que
            esperar antes de rolar. */}
        {abaAtiva === "CONTATO" && <MatrizComunicacao />}
        {abaAtiva !== "CONTATO" && abaAtiva && abas.length > 1 && (
          <div>
            <h2 className="text-[22px] font-bold text-[#0D1F3C]">{AREA_NOME[abaAtiva]}</h2>
            <div className="h-[3px] w-12 bg-[#F4801F] rounded-full my-2" />
            <p className="text-[14px] text-gray-500">{AREA_RESUMO[abaAtiva]}</p>
          </div>
        )}
        {/* ⚠ A ORDEM É A DO PROCESSO. Vitor (22/08/2026): "sempre começar com os documentos da
            Engenharia LPC e LE, depois Tabela de compras". Faz sentido: a Engenharia define o que
            será fabricado, o Compras traz o material, a Qualidade prova que está conforme. O
            cliente lê a obra na ordem em que ela acontece. */}
        {/* ⚠ O MODELO VEM PRIMEIRO na Engenharia: é a obra inteira numa imagem, e é por ele que o
            cliente encontra a peça sobre a qual quer perguntar. Lista depois — quem já sabe a marca
            vai direto nela; quem não sabe, acha girando o modelo. */}
        {mostrar("MODELO_NAVEGAVEL") && (
          <Bloco icone={Box} titulo="Modelo 3D da obra"
            sub="Gire, aproxime e clique numa peça para ver marca, peso, etapa e rastreabilidade.">
            <ModeloObraCliente token={token} />
          </Bloco>
        )}

        {mostrar("LPC") && (
          <BlocoLista icone={Layers} titulo="Lista de produção (LPC)" fonte="LPC" d={dados.lpc} token={token} />
        )}

        {mostrar("LE") && (
          <BlocoLista icone={Truck} titulo="Lista de expedição (LE)" fonte="LE" d={dados.le} token={token} />
        )}

        {mostrar("COMPRAS") && (
          <Bloco icone={ShoppingCart} titulo="Materiais da obra" recolhida
            sub={`${dados.compras.recebidos} de ${dados.compras.total} recebidos`}>
            <Tabela
              quebra={[0]} larguraMin={780}
              /* ⚠ a RM diz DE ONDE a obra pediu, e vem antes do pedido porque é o que acontece
                 antes: requisição → cotação → pedido → nota. */
              cols={["Material", "Qtd.", "Situação", "RM", "Pedido", "Chegou em", "NF", "Rastreio"]}
              linhas={dados.compras.itens.slice(0, 200).map((c) => [
                c.material, c.qtd,
                <span key="s" className={c.status === "Recebido" ? "text-emerald-700 font-semibold" : ""}>{c.status}</span>,
                c.rm || "—",
                c.pedido || "—", fmtD(c.chegouEm), c.nf || "—",
                c.rastreio ? <span key="r" className="font-mono text-[#006EAB]">R {c.rastreio}</span> : "—",
              ])}
              rodape={dados.compras.itens.length > 200 ? `e mais ${dados.compras.itens.length - 200} itens.` : null}
            />

            {/* ⚠⚠ A PROVA DE QUE O MATERIAL CHEGOU. Vitor (04/09/2026): "precisa ficar dentro da aba
                de compras do painel do cliente". Agrupada por NOTA FISCAL, que é a coluna que ele
                acabou de ler na tabela acima — é assim que a foto se liga à linha. */}
            {dados.compras.fotos?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-[13px] font-semibold text-[#0D1F3C] mb-2">Recebimento do material</p>
                <div className="space-y-3">
                  {dados.compras.fotos.map((g, i) => (
                    <div key={i}>
                      <p className="text-[11.5px] text-gray-500 mb-1.5">
                        {g.nf ? <>NF {g.nf}</> : "sem nota informada"}
                        {g.fotos[0]?.em ? <> · {fmtD(g.fotos[0].em)}</> : null}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {g.fotos.map((f) => (
                          <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                            title="abrir a foto">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.url} alt={`Recebimento${g.nf ? ` da NF ${g.nf}` : ""}`}
                              className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:border-[#006EAB]" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Bloco>
        )}

        {mostrar("CRONOGRAMA") && (
          <Bloco icone={CalendarRange} titulo="Cronograma da obra"
            sub={`${fmtD(dados.cronograma.inicio)} a ${fmtD(dados.cronograma.fim)}`}>
            <div className="space-y-3">
              {dados.cronograma.frentes.map((f, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-[14px] font-semibold capitalize">{f.nome.toLowerCase()}</span>
                    <span className="text-[12px] text-gray-500 tabular-nums shrink-0">
                      {fmtD(f.inicio)} — {fmtD(f.fim)} · <strong className="text-[#0D1F3C]">{f.percentual}%</strong>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#006EAB] rounded-full transition-all"
                      style={{ width: `${Math.min(100, f.percentual)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Bloco>
        )}
        {mostrar("CERTIFICADOS") && (
          <Certificados token={token} lista={dados.certificados} />
        )}

        {mostrar("RELATORIOS") && (
          <Bloco icone={FileText} titulo="Relatórios de inspeção" recolhida
            sub={`${dados.relatorios.length} aprovados`}>
            {/* ⚠ SÓ OS APROVADOS. Relatório em rascunho ou reprovado é trabalho em curso;
                mostrá-lo sem o reparo ao lado seria entregar meia história. */}
            <Tabela
              quebra={[2]} larguraMin={520}
              cols={["Documento", "Ensaio", "Peças", "Data"]}
              linhas={dados.relatorios.map((r) => [
                <span key="c" className="font-mono font-semibold text-[#006EAB]">{r.codigo}</span>,
                r.tipoLabel,
                r.marcas.join(", ") || "—",
                fmtD(r.data),
              ])}
            />
          </Bloco>
        )}
        {/* ⚠⚠ O VOLUME É PARA BAIXAR — antes esta lista só provava que o dossiê existe.
            O bloco mostrava número, título, páginas e tamanho, sem link nenhum, e mandava o
            cliente esperar o e-mail do aceite. Vitor (24/08/2026) escolheu liberar aqui depois do
            aceite: a rota só serve com o livro `ACEITO`, então o que aparece nesta tela já passou
            pelas quatro assinaturas da cadeia — inclusive a dele. */}
        {mostrar("DATABOOK") && (
          <Bloco icone={BookCheck} titulo="Data Book da obra"
            sub={`${dados.databook.volumes.length} volume(s) · R${String(dados.databook.revisao).padStart(2, "0")}`}>
            {/* ─── EM CONFERÊNCIA, ANTES DA ASSINATURA ────────────────────────────────────────
                Vitor (31/08/2026): "antes de enviar para assinatura, teria como disponibilizar no
                portal do cliente o PDF para ele avaliar as informações (…) depois do ok dele aí sim
                subimos para assinatura".

                ⚠ O AVISO VEM ANTES DOS ARQUIVOS, de propósito. Se ele viesse depois, o cliente
                baixaria o volume achando que é o dossiê final — e a leitura muda tudo: um é
                documento fechado, o outro é rascunho que ele ainda pode recusar. */}
            {dados.databook.emAvaliacao && (
              <div className="mb-4 rounded-xl border-2 border-[#F4801F]/40 bg-[#FFF8F0] px-4 py-3">
                <p className="text-[13px] font-semibold text-[#0D1F3C]">
                  Rascunho para sua conferência
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
                  Este ainda não é o dossiê definitivo — é o rascunho, para você conferir as
                  informações antes de fecharmos. Depois do seu retorno emitimos o documento, ele
                  passa pelas assinaturas e a versão final volta para cá.
                </p>
              </div>
            )}
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {dados.databook.volumes.map((v) => (
                <a key={v.volume} href={`/api/portal/${token}/databook?volume=${v.volume}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#006EAB]/5 transition-colors">
                  <span className="text-[11px] font-bold text-white bg-[#0D1F3C] rounded px-2 py-1 shrink-0">
                    {String(v.volume).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium truncate">{v.titulo || "Anexos"}</span>
                    <span className="block text-[11px] text-gray-500">
                      {Number(v.paginas).toLocaleString("pt-BR")} páginas · {fmtMB(v.tamanho)}
                    </span>
                  </span>
                  <Download size={14} className="text-[#006EAB] shrink-0" />
                </a>
              ))}
            </div>
            {/* ⚠ a data do aceite é o que dá autoridade ao arquivo: diz que este é o dossiê que a
                obra fechou, não uma cópia de trabalho. Sem ela, um PDF baixado de um portal é só
                mais um PDF. */}
            {dados.databook.emAvaliacao ? (
              <AvaliacaoDataBook token={token} dados={dados.databook} />
            ) : (
              /* ⚠ a data do aceite é o que dá autoridade ao arquivo: diz que este é o dossiê que a
                 obra fechou, não uma cópia de trabalho. Sem ela, um PDF baixado de um portal é só
                 mais um PDF. */
              <p className="text-[12px] text-gray-500 mt-3">
                Dossiê aceito{dados.databook.aceiteEm ? ` em ${dados.databook.aceiteEm}` : ""} · revisão R{String(dados.databook.revisao).padStart(2, "0")}.
                Cada volume abre em PDF.
              </p>
            )}
          </Bloco>
        )}
        {/* ⚠ ENGENHARIA — o que foi ESCOLHIDO da pasta 2.5.5 (envio ao cliente). Bloco próprio, e
            não misturado com "Documentos da obra": um é desenho e lista de projeto, o outro é
            documento formal (PIT, EPS, ARTs). Juntar faria o cliente caçar o desenho no meio de
            certificado de soldador. */}
        {/* ⚠ os documentos escolhidos do servidor, na ÁREA de cada um, com o nome que o cliente
            entende — não o nome do arquivo. (Vitor, 26/08/2026) */}
        {dados.docsPorArea?.[abaAtiva]?.length > 0 && (
          <DocumentosDaArea key={abaAtiva} grupos={dados.docsPorArea[abaAtiva]} token={token} cod={cod} />
        )}

        {/* ⚠ na QUALIDADE, não na Engenharia: PIT e PLP são plano de CONTROLE — o que se inspeciona
            e como se pinta. Quem responde por eles assina como Qualidade. (Vitor, 26/08/2026) */}
        {mostrar("PLANOS") && (
          <Bloco icone={ShieldCheck} titulo="Planos de controle (PIT e PLP)"
            sub={dados.planos?.length ? `${dados.planos.reduce((n, g) => n + g.itens.length, 0)} documentos` : "PIT e PLP da obra"}>
            {/* ⚠⚠ O ACEITE É O ASSUNTO DESTE BLOCO. Vitor (26/08/2026): "o PIT também deve conter o
                aceite por parte do cliente, não pode deixar de ter esse aceite" — e o cliente tem
                de ver, na página dele, se já aceitou e o que está pendente. */}
            {dados.planosAceite && (
              <div className="space-y-2 mb-3">
                {["PIT", "PLP"].filter((k) => dados.planosAceite[k]).map((k) => (
                  <PlanoAceite key={k} doc={k} p={dados.planosAceite[k]} token={token} comCod={comCod} />
                ))}
              </div>
            )}
            {dados.planos?.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-1.5">
                {dados.planos.flatMap((g) => g.itens).map((doc) => (
                  <a key={doc.id} href={comCod(`/api/portal/${token}/doc?id=${doc.id}`)} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-1.5 hover:border-[#006EAB] hover:bg-[#006EAB]/5 transition-colors">
                    <Download size={12} className="text-[#006EAB] shrink-0" />
                    <span className="text-[12px] truncate" title={doc.nome}>{doc.nome}</span>
                  </a>
                ))}
              </div>
            )}
          </Bloco>
        )}

        {mostrar("DOCUMENTOS") && (
          <Bloco icone={FileText} titulo="Documentos da Engenharia" recolhida
            sub={`${dados.documentos.length} assuntos`}>
            {/* ⚠ agrupado por assunto, não uma lista chapada: a obra tem centenas de documentos e o
                que o cliente quer saber é QUE TIPO de controle existe — PIT, EPS, qualificação de
                soldador — não o nome de cada arquivo. */}
            <div className="space-y-4">
              {dados.documentos.map((g) => (
                <div key={g.assunto}>
                  <p className="text-[13px] font-semibold mb-1.5">
                    {g.assunto} <span className="text-gray-400 font-normal">{g.total}</span>
                  </p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {g.itens.map((doc) => (
                      // ⚠ o documento é para BAIXAR. Vitor (22/08/2026): "esses documentos devem
                      // ser possíveis de baixar também, para que o cliente possa ver tudo que ele
                      // precisa". Lista que só mostra o nome prova que o documento existe e não
                      // deixa lê-lo — é pior que não listar.
                      <a key={doc.id} href={comCod(`/api/portal/${token}/doc?id=${doc.id}`)} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-1.5 hover:border-[#006EAB] hover:bg-[#006EAB]/5 transition-colors">
                        <Download size={12} className="text-[#006EAB] shrink-0" />
                        <span className="text-[12px] truncate">{doc.nome}</span>
                      </a>
                    ))}
                  </div>
                  {g.total > g.itens.length && (
                    <p className="text-[11px] text-gray-500 mt-1">e mais {g.total - g.itens.length}.</p>
                  )}
                </div>
              ))}
            </div>
          </Bloco>
        )}
        {mostrar("FOTOS") && (
          <Bloco icone={ImageIcon} titulo="A obra em imagens" sub={`${portal.fotos.length} registros`}>
            {/* ⚠ FOTO DE OBRA É PARA SER VISTA. Vitor (03/09/2026): "aumente um pouco a
                visualização das fotos (…) hoje está bem pouca a visualização". Passou de três
                colunas de 160 px para duas de 288 px — quase o triplo de área por foto — e cada uma
                abre em tamanho cheio no clique, que é o que alguém faz quando quer olhar de perto
                uma solda ou um acabamento. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portal.fotos.map((f, i) => (
                <figure key={i} className="rounded-xl overflow-hidden border border-gray-100 bg-white">
                  <a href={f.url} target="_blank" rel="noreferrer" title="abrir a foto em tamanho cheio">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.legenda || ""} className="w-full h-56 sm:h-72 object-cover hover:opacity-95 transition-opacity" />
                  </a>
                  {f.legenda && <figcaption className="text-[12px] text-gray-500 px-3 py-2">{f.legenda}</figcaption>}
                </figure>
              ))}
            </div>
          </Bloco>
        )}
      </div>

      <footer className="bg-[#0D1F3C] text-[#9fc0dd] py-10">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="h-[3px] w-16 bg-[#F4801F] rounded-full mb-6" />
          <p className="text-[13px] leading-relaxed max-w-2xl">
            <strong className="text-white">Torg Metal</strong> · Sistema de Gestão da Qualidade certificado
            ISO 9001. As informações desta página são geradas a partir dos registros de fabricação da sua
            obra e atualizadas conforme ela avança.
          </p>
        </div>
      </footer>

      {/* ⚠⚠ O TORGUINHO FLUTUA, não ocupa seção. Vitor (03/09/2026): "e se ao invés de ficar um chat
          bot vc só deixar a informação que o Torguinho pode ajudar eles e automaticamente ele
          aparece lá embaixo para eles? não fica mais limpo?". Fica: o cliente entra no portal para
          ver o modelo e os documentos, e um campo de conversa no meio disso pede atenção que ele não
          quis dar. No canto, o Torguinho está sempre à mão e nunca no caminho — e vale na página
          toda, não só na aba do modelo. */}
      {tem("ASSISTENTE") && <TorguinhoCliente token={token} obra={op.obra || op.numero} />}
    </main>
  );
}

/**
 * ⚠ CADA SEÇÃO RECOLHE. Vitor (22/08/2026): "cada seção pode ficar minimizada para poder ficar
 * fácil a navegação". Com LPC, LE, compras, certificados e relatórios, a página passa de mil
 * linhas — e uma página que só se navega rolando obriga o cliente a passar pelo que não quer para
 * chegar ao que quer.
 *
 * Abre fechada quando é lista longa (`recolhida`): o cliente escolhe o que abrir, em vez de fechar
 * o que não pediu.
 */
/**
 * ─── OS CERTIFICADOS, COM O R NA FRENTE ─────────────────────────────────────────
 * Vitor (22/08/2026): "o certificado deve ficar de acesso para ele poder visualizar, baixar e até
 * mesmo baixar em lote todos os certificados que ele escolher"; e "o mais importante precisa ter o
 * número da rastreabilidade".
 *
 * ⚠ O R É A PRIMEIRA COLUNA porque é ele que amarra a peça ao material: da peça chega-se ao R, do
 * R à corrida, da corrida ao certificado e à nota. Uma lista de certificados sem o R é uma pilha de
 * PDFs — o cliente não consegue partir de uma peça montada no canteiro e provar de que aço ela é.
 */
function Certificados({ token, lista }) {
  const [sel, setSel] = useState(() => new Set());
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");

  const baixaveis = lista.filter((c) => c.baixavel);
  const todosMarcados = baixaveis.length > 0 && sel.size === baixaveis.length;
  const alternar = (id) => setSel((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function baixarLote() {
    setBaixando(true); setErro("");
    try {
      const r = await fetch(`/api/portal/${token}/lote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...sel] }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao gerar o pacote.");
      const falhas = Number(r.headers.get("X-Falhas") || 0);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a2 = document.createElement("a");
      a2.href = url; a2.download = "certificados.zip"; a2.click();
      URL.revokeObjectURL(url);
      // ⚠ zip com menos arquivos do que o pedido, em silêncio, é o cliente achando que tem tudo
      if (falhas) setErro(`${falhas} certificado(s) não puderam ser incluídos — fale com a nossa Qualidade.`);
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setBaixando(false); }
  }

  const acao = baixaveis.length > 0 && (
    <div className="flex items-center gap-2">
      {sel.size > 0 && (
        <button onClick={baixarLote} disabled={baixando}
          className="text-[12px] font-semibold text-white bg-[#006EAB] rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
          {baixando ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
          baixar {sel.size}
        </button>
      )}
      <span className="text-[12px] text-gray-500">
        {sel.size ? `${sel.size} de ${baixaveis.length}` : `${baixaveis.length} disponíveis`}
      </span>
    </div>
  );

  return (
    <Bloco icone={Award} titulo="Certificados de qualidade" recolhida acao={acao}
      sub={`${lista.length} materiais com rastreabilidade`}>
      {erro && <p className="text-[12px] text-red-600 mb-2">{erro}</p>}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px] min-w-[540px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              {/* ⚠ A CAIXA MESTRA FICA NO CABEÇALHO DA COLUNA, onde a pessoa procura. Vitor
                  (22/08/2026): "coloque a caixa para poder selecionar todos certificados". Existia
                  só o link "selecionar todos" no canto do bloco — longe da coluna e escrito, quando
                  o gesto natural é marcar a caixa de cima. */}
              <th className="w-6 pb-2 px-1">
                <button onClick={() => setSel(todosMarcados ? new Set() : new Set(baixaveis.map((c) => c.id)))}
                  title={todosMarcados ? "limpar seleção" : "selecionar todos"} aria-label="selecionar todos"
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    todosMarcados ? "bg-[#006EAB] border-[#006EAB]"
                    : sel.size ? "bg-[#006EAB]/20 border-[#006EAB]" : "border-gray-300 hover:border-[#006EAB]"}`}>
                  {/* parcial ganha um traço, não um tique: marcar o que está meio marcado engana */}
                  {todosMarcados ? <Check size={11} className="text-white" />
                    : sel.size ? <span className="block w-2 h-[2px] bg-[#006EAB] rounded" /> : null}
                </button>
              </th>
              <th className="font-semibold pb-2 px-1">Rastreio</th>
              <th className="font-semibold pb-2 px-1">Material</th>
              <th className="font-semibold pb-2 px-1">Corrida</th>
              <th className="font-semibold pb-2 px-1">Certificado</th>
              <th className="font-semibold pb-2 px-1">Fornecedor</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.slice(0, 300).map((c) => (
              <tr key={c.id} className={sel.has(c.id) ? "bg-[#006EAB]/5" : ""}>
                <td className="py-2 px-1">
                  {c.baixavel && (
                    <button onClick={() => alternar(c.id)} aria-label="selecionar"
                      className={`w-4 h-4 rounded border flex items-center justify-center ${sel.has(c.id) ? "bg-[#006EAB] border-[#006EAB]" : "border-gray-300"}`}>
                      {sel.has(c.id) && <Check size={11} className="text-white" />}
                    </button>
                  )}
                </td>
                <td className="py-2 px-1 font-mono font-semibold text-[#006EAB] whitespace-nowrap">
                  {c.r ? `R ${c.r}` : "—"}
                </td>
                <td className="py-2 px-1">{c.material}</td>
                <td className="py-2 px-1 whitespace-nowrap">{c.corrida || "—"}</td>
                <td className="py-2 px-1 whitespace-nowrap">{c.certificado || "—"}</td>
                <td className="py-2 px-1 whitespace-nowrap">{c.fornecedor || "—"}</td>
                <td className="py-2 px-1">
                  {c.baixavel && (
                    <a href={`/api/portal/${token}/doc?id=${c.id}`} target="_blank" rel="noreferrer"
                      title="abrir o certificado" className="text-gray-400 hover:text-[#006EAB] inline-flex">
                      <Download size={14} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lista.length > 300 && (
        <p className="text-[12px] text-gray-500 mt-3">
          Mostrando 300 de {lista.length} — os demais estão no Data Book.
        </p>
      )}
    </Bloco>
  );
}

/**
 * ⚠ A REVISÃO É O ASSUNTO MAIS SENSÍVEL DE UMA LISTA. Vitor (22/08/2026): "nos casos de uma
 * revisão disponibilizar uma lista nova para Download, informa a revisão atual e deixar com um
 * alerta quando ele entrar para saber o que mudou".
 *
 * O cliente confere o que vai receber contra a lista que ele tem na mão. Quando a engenharia
 * reimporta e as marcas mudam, quem está do outro lado não tem como saber — e a conversa vira
 * "mas na minha lista estava assim". Dizer só "a lista mudou" seria quase o mesmo que não dizer
 * nada: ele teria de conferir marca por marca de novo. Por isso o aviso é específico.
 *
 * O "Entendi" fecha o aviso PARA ELE (grava no portal, não no navegador): trocar de aparelho não
 * pode ressuscitar um alerta que ele já leu, nem apagar um que ele nunca viu.
 */
function AvisoDeRevisao({ token, listas }) {
  const [ocultas, setOcultas] = useState([]);
  const pendentes = listas.filter((l) => l.rev?.mudou && !l.rev.vista && !ocultas.includes(l.fonte));
  if (!pendentes.length) return null;
  const entendi = (l) => {
    setOcultas((v) => [...v, l.fonte]);
    fetch(`/api/portal/${token}/lista`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fonte: l.fonte, seq: l.rev.seq }),
    }).catch(() => {});
  };
  return (
    <section className="max-w-3xl mx-auto px-6 sm:px-8 mt-6 space-y-3">
      {pendentes.map((l) => <CartaoRevisao key={l.fonte} l={l} onEntendi={() => entendi(l)} />)}
    </section>
  );
}

const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

/**
 * Os documentos de uma área, com CAIXA DE SELEÇÃO para baixar vários de uma vez.
 *
 * Vitor (26/08/2026): "crie uma caixa de seleção para que o cliente possa baixar mais de um arquivo
 * de uma vez".
 *
 * ⚠ CLICAR NO NOME CONTINUA BAIXANDO UM SÓ. Quem quer um arquivo não devia ter de marcar, rolar até
 * o botão e esperar um ZIP — a seleção é atalho para quem quer muitos, não pedágio para quem quer
 * um. Por isso a caixa fica à esquerda e o nome segue sendo link.
 */
function DocumentosDaArea({ grupos, token, cod }) {
  const [sel, setSel] = useState(() => new Set());
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");
  // ⚠ nasce vazio = todas as pastas fechadas. Quem quer o índice vê o índice; quem quer os arquivos
  // abre a pasta — e quem quer a pasta inteira nem precisa abrir, o botão de baixar está na faixa.
  const [pastasAbertas, setPastasAbertas] = useState(() => new Set());
  const abrirPasta = (nome) => setPastasAbertas((p) => {
    const n = new Set(p);
    if (n.has(nome)) n.delete(nome); else n.add(nome);
    return n;
  });

  const todos = grupos.flatMap((g) => g.itens);
  const marcar = (id, on) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const marcarGrupo = (g, on) => setSel((s) => {
    const n = new Set(s);
    for (const d of g.itens) { if (on) n.add(d.id); else n.delete(d.id); }
    return n;
  });
  const pesoSel = todos.filter((d) => sel.has(d.id)).reduce((t, d) => t + (d.tamanho || 0), 0);

  // ⚠⚠ QUEBRA EM PARTES QUE CABEM. Vitor (01/09/2026): "certifique-se que no caso de arquivos muito
  // pesados você extraia em um zip esses projetos para não ter erro".
  //
  // O ZIP é montado INTEIRO em memória no servidor, então existe um teto de bytes real. Mandar a
  // seleção inteira e torcer dava um erro seco depois de trinta segundos de espera — com a pasta de
  // fabricação (centenas de desenhos) isso passou a ser o caso comum, não a exceção.
  //
  // ⚠ O CORTE É POR TAMANHO, não por quantidade: cada item já traz o `tamanho`, e é o peso somado
  // que derruba a função. Um arquivo sozinho maior que o teto vai na sua própria parte — cabe ao
  // servidor recusá-lo com a mensagem certa, não a esta função escondê-lo.
  // ⚠ 150 MB por parte (o servidor aceita 200) e no máximo 700 arquivos: o corte por TAMANHO
  // sozinho deixava passar uma parte com 1.300 desenhos leves, acima do teto de contagem lá.
  const TETO_PARTE = 150 * 1024 * 1024;
  const TETO_PARTE_ARQS = 700;

  // ⚠⚠ BAIXAR A PASTA INTEIRA NUM CLIQUE. Vitor (03/09/2026, cobrando): "vc ainda não arrumou a
  // opção de conseguir selecionar a pasta e vc levar ela toda para o portal deles e deixar eles
  // baixarem a pasta como um todo". Marcar a pasta e depois procurar o botão de baixar embaixo é
  // um passo a mais em cima do que ele pediu — a pasta agora baixa direto, sem passar pela seleção.
  // A seleção continua existindo para quem quer montar um pacote misto.
  async function baixar(lista) {
    setBaixando(true); setErro("");
    try {
      const escolhidos = Array.isArray(lista) && lista.length ? lista : todos.filter((d) => sel.has(d.id));
      const partes = [];
      let atual = [], peso = 0;
      for (const d of escolhidos) {
        const t = Number(d.tamanho) || 0;
        if (atual.length && (peso + t > TETO_PARTE || atual.length >= TETO_PARTE_ARQS)) { partes.push(atual); atual = []; peso = 0; }
        atual.push(d); peso += t;
      }
      if (atual.length) partes.push(atual);

      for (let k = 0; k < partes.length; k++) {
        const r = await fetch(`/api/portal/${token}/eng-zip${cod ? `?d=${encodeURIComponent(cod)}` : ""}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: partes[k].map((d) => d.id) }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error((j.error || "Não consegui montar o download.") + (partes.length > 1 ? ` (parte ${k + 1} de ${partes.length})` : ""));
        }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const obra = (r.headers.get("content-disposition") || "").match(/OP-\d+/)?.[0] || "obra";
        // ⚠ o nome numera a parte: "documentos.zip (1)" na pasta de downloads não diz nada
        a.download = partes.length > 1 ? `documentos-${obra}-parte-${k + 1}-de-${partes.length}.zip` : `documentos-${obra}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setBaixando(false); }
  }

  return (
    <Bloco icone={Layers} titulo="Documentos" sub={`${todos.length} arquivos`}>
      <div className="space-y-4">
        {grupos.map((g) => {
          const marcadosNoGrupo = g.itens.filter((d) => sel.has(d.id)).length;
          return (
            <div key={g.assunto}>
              {/* ⚠⚠ TODO GRUPO É UMA PASTA, inclusive o que vem numa pasta só. Vitor (03/09/2026):
                  "a pasta de diagrama de montagem deixe igual vc deixou a do projeto, minimizada, e
                  dê a opção do cliente baixar por pasta". O Diagrama de montagem cai numa pasta
                  única, então não entrava no agrupamento por subpasta e ficava aberto e sem botão —
                  duas regras diferentes para a mesma coisa, dependendo de como a Engenharia
                  arrumou os arquivos. Agora a faixa é do GRUPO, e a subpasta é o nível de dentro. */}
              <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 mb-1.5">
                <button onClick={() => abrirPasta(g.assunto)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                  {pastasAbertas.has(g.assunto) ? <ChevronDown size={13} className="text-[#006EAB] shrink-0" /> : <ChevronRight size={13} className="text-[#006EAB] shrink-0" />}
                  <FolderOpen size={13} className="text-[#006EAB] shrink-0" />
                  <span className="text-[13px] font-semibold truncate">{g.assunto}</span>
                </button>
                <span className="text-[11px] text-gray-400 shrink-0">
                  {g.itens.length} arquivo{g.itens.length > 1 ? "s" : ""}
                  {g.subpastas?.length ? ` · ${g.subpastas.length} pastas` : ""}
                </span>
                <button onClick={() => marcarGrupo(g, marcadosNoGrupo !== g.itens.length)}
                  className="text-[11px] text-gray-500 hover:text-[#006EAB] hover:underline shrink-0">
                  {marcadosNoGrupo === g.itens.length ? "desmarcar" : "selecionar"}
                </button>
                <button onClick={() => baixar(g.itens)} disabled={baixando}
                  className="shrink-0 text-[11px] font-semibold text-white bg-[#006EAB] hover:bg-[#005A8C] disabled:opacity-50 rounded-md px-2 py-1 inline-flex items-center gap-1">
                  <Download size={11} /> baixar a pasta
                </button>
              </div>

              {/* ⚠⚠ AS PASTAS COMO PACOTE, quando a Engenharia separou em mais de uma. Vitor
                  (03/09/2026): "quero que o cliente veja como se fosse uma pasta, onde ele
                  seleciona ela e baixa por pacotes" — e, na mesma conversa, "precisamos ter a opção
                  de selecionar o projeto também, ter as duas opções". Por isso a pasta é uma FAIXA
                  com o botão de marcar tudo dela, e os arquivos seguem listados um a um embaixo.
                  Uma pasta só não vira caixa: seria repetir o título da seção em volta de nada. */}
              {g.subpastas?.length > 0 && pastasAbertas.has(g.assunto) && (
                <div className="space-y-2.5 mb-1.5 pl-3">
                  {g.subpastas.map((p) => {
                    const naPasta = p.itens.filter((d) => sel.has(d.id)).length;
                    const todosNaPasta = naPasta === p.itens.length;
                    // ⚠⚠ PASTA NASCE FECHADA. Vitor (03/09/2026): "tem como deixar as pastas
                    // minimizadas no portal da engenharia? pois elas aparecem abertas e fica muito
                    // extensas". Numa obra com seis pastas de 200 desenhos, a página aberta é uma
                    // rolagem de mil linhas antes de chegar na seção seguinte — o cliente perde a
                    // noção do que existe. Fechada, ele vê o índice; abre a que interessa.
                    const aberta = pastasAbertas.has(p.nome);
                    return (
                      <div key={p.nome} className="border border-gray-100 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap bg-gray-50 border-b border-gray-100 px-3 py-1.5">
                          <button onClick={() => abrirPasta(p.nome)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                            {aberta ? <ChevronDown size={13} className="text-[#006EAB] shrink-0" /> : <ChevronRight size={13} className="text-[#006EAB] shrink-0" />}
                            <FolderOpen size={13} className="text-[#006EAB] shrink-0" />
                            <span className="text-[12.5px] font-semibold truncate">{p.nome}</span>
                          </button>
                          <span className="text-[11px] text-gray-400 shrink-0">{p.itens.length} arquivo{p.itens.length > 1 ? "s" : ""}{p.tamanho ? ` · ${fmtMB(p.tamanho)}` : ""}</span>
                          <button onClick={() => marcarGrupo(p, !todosNaPasta)}
                            className="ml-auto text-[11px] text-gray-500 hover:text-[#006EAB] hover:underline">
                            {todosNaPasta ? "desmarcar" : "selecionar"}
                          </button>
                          <button onClick={() => baixar(p.itens)} disabled={baixando}
                            className="text-[11px] font-semibold text-white bg-[#006EAB] hover:bg-[#005A8C] disabled:opacity-50 rounded-md px-2 py-1 inline-flex items-center gap-1">
                            <Download size={11} /> baixar a pasta
                          </button>
                        </div>
                        <div className={`grid sm:grid-cols-2 gap-1.5 p-2 ${aberta ? "" : "hidden"}`}>
                          {p.itens.map((doc) => {
                            const on = sel.has(doc.id);
                            return (
                              <div key={doc.id}
                                className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 transition-colors ${on ? "border-[#006EAB] bg-[#006EAB]/5" : "border-gray-100 hover:border-[#006EAB]"}`}>
                                <input type="checkbox" checked={on} onChange={(e) => marcar(doc.id, e.target.checked)}
                                  aria-label={`Selecionar ${doc.nome}`} className="accent-[#006EAB] shrink-0" />
                                <a href={`/api/portal/${token}/eng?id=${encodeURIComponent(doc.id)}${cod ? `&d=${encodeURIComponent(cod)}` : ""}`}
                                  target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 min-w-0 flex-1 hover:text-[#006EAB]">
                                  <Download size={12} className="text-[#006EAB] shrink-0" />
                                  <span className="text-[12px] truncate" title={doc.nome}>{doc.nome}</span>
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={`grid sm:grid-cols-2 gap-1.5 pl-3 ${g.subpastas?.length || !pastasAbertas.has(g.assunto) ? "hidden" : ""}`}>
                {g.itens.map((doc) => {
                  const on = sel.has(doc.id);
                  return (
                    <div key={doc.id}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 transition-colors ${on ? "border-[#006EAB] bg-[#006EAB]/5" : "border-gray-100 hover:border-[#006EAB]"}`}>
                      <input type="checkbox" checked={on} onChange={(e) => marcar(doc.id, e.target.checked)}
                        aria-label={`Selecionar ${doc.nome}`} className="accent-[#006EAB] shrink-0" />
                      <a href={`/api/portal/${token}/eng?id=${encodeURIComponent(doc.id)}${cod ? `&d=${encodeURIComponent(cod)}` : ""}`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 min-w-0 flex-1 hover:text-[#006EAB]">
                        <Download size={12} className="text-[#006EAB] shrink-0" />
                        <span className="text-[12px] truncate" title={doc.nome}>{doc.nome}</span>
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ⚠ a barra só aparece com algo marcado: botão desabilitado permanente é ruído em página de
          cliente, que não conhece a tela e não sabe o que precisa fazer para habilitar. */}
      {sel.size > 0 && (
        <div className="sticky bottom-3 mt-4 flex items-center gap-3 flex-wrap bg-white border border-[#006EAB]/30 rounded-xl px-4 py-2.5 shadow-sm">
          <button onClick={baixar} disabled={baixando}
            className="text-[13px] font-semibold text-white bg-[#006EAB] rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2">
            {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Baixar {sel.size} arquivo{sel.size > 1 ? "s" : ""}
          </button>
          {pesoSel > 0 && <span className="text-[12px] text-gray-500">{fmtMB(pesoSel)} em um .zip</span>}
          <button onClick={() => setSel(new Set())} className="text-[12px] text-gray-500 hover:text-[#0D1F3C]">limpar</button>
          {erro && <span className="text-[12px] text-red-600">{erro}</span>}
        </div>
      )}
    </Bloco>
  );
}

const NOME_PLANO = { PIT: "Plano de Inspeção e Testes (PIT)", PLP: "Plano de Pintura (PLP)" };
// ⚠ `fmtD` é para data pura ("AAAA-MM-DD"); o aceite é um instante, com hora e fuso.
const fmtInstante = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * O estado do aceite de um plano, na página do cliente.
 *
 * ⚠ O BOTÃO DE ACEITAR SÓ APARECE PARA QUEM FOI CONVIDADO A ACEITAR — o servidor só devolve
 * `tokenDoAceite` quando quem abriu é, pelo `?d=` do e-mail, um destinatário daquele envio. O link
 * do portal costuma ser repassado dentro da obra; aceite de plano de inspeção é de quem responde.
 */
function PlanoAceite({ doc, p, token, comCod }) {
  const aceito = !!p.aceito;
  return (
    <div className={`rounded-xl border px-4 py-3 ${aceito ? "border-emerald-200 bg-emerald-50/60" : "border-[#F4801F]/40 bg-[#F4801F]/5"}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#0D1F3C]">{NOME_PLANO[doc] || doc}</p>
          <p className={`text-[12px] mt-0.5 ${aceito ? "text-emerald-700" : "text-[#9a5410]"}`}>
            {aceito
              ? `Aceito em ${fmtInstante(p.aceitoEm)}${p.aceitoPor ? ` por ${p.aceitoPor}` : ""}.`
              : "Aguardando o aceite do cliente."}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a href={comCod(`/api/portal/${token}/plano?doc=${doc}`)} target="_blank" rel="noreferrer"
            className="text-[12px] font-semibold text-[#006EAB] hover:underline inline-flex items-center gap-1">
            <Download size={12} /> ver o documento
          </a>
          {!aceito && p.tokenDoAceite && (
            <a href={`/assinar/${p.tokenDoAceite}`}
              className="text-[12px] font-semibold text-white bg-[#006EAB] rounded-lg px-3 py-1.5 hover:opacity-90">
              Registrar o aceite
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CartaoRevisao({ l, onEntendi }) {
  const [aberto, setAberto] = useState(false);
  const r = l.rev;
  const resumo = [
    r.nIncluidas && plural(r.nIncluidas, "marca incluída", "marcas incluídas"),
    r.nExcluidas && plural(r.nExcluidas, "excluída", "excluídas"),
    r.nAlteradas && plural(r.nAlteradas, "alterada", "alteradas"),
  ].filter(Boolean).join(" · ");
  return (
    <div className="bg-[#FFF7ED] border border-[#F4801F]/35 rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <History size={18} className="text-[#F4801F] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-[#0D1F3C]">
            {l.titulo}{r.rotulo ? ` — revisão ${r.rotulo}` : ""}
          </p>
          <p className="text-[13px] text-gray-600 mt-1">
            Atualizada em {new Date(r.publicadaEm).toLocaleDateString("pt-BR")}. {resumo}.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button onClick={() => setAberto((v) => !v)}
              className="text-[12px] font-semibold text-[#006EAB] hover:underline">
              {aberto ? "Ocultar o que mudou" : "Ver o que mudou"}
            </button>
            <span className="text-gray-300">·</span>
            <button onClick={onEntendi} className="text-[12px] font-semibold text-gray-500 hover:text-[#0D1F3C]">
              Entendi
            </button>
          </div>
          {aberto && (
            <div className="mt-4 space-y-3 border-t border-[#F4801F]/25 pt-4">
              <GrupoMarcas titulo="Incluídas" n={r.nIncluidas} itens={r.incluidas} cor="text-emerald-700" fundo="bg-emerald-50 text-emerald-800 border-emerald-200" />
              <GrupoMarcas titulo="Excluídas" n={r.nExcluidas} itens={r.excluidas} cor="text-red-700" fundo="bg-red-50 text-red-800 border-red-200" />
              <GrupoMarcas titulo="Alteradas" n={r.nAlteradas} itens={r.alteradas} cor="text-amber-700" fundo="bg-amber-50 text-amber-900 border-amber-200" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ⚠ o detalhe gravado é limitado; quando a revisão é enorme, o contador continua sendo o total
    real e a diferença aparece como "+N" em vez de sumir sem aviso. */
function GrupoMarcas({ titulo, n, itens, cor, fundo }) {
  if (!n) return null;
  const rotulo = (x) => {
    if (!x.para) return x.marca;
    const q = x.de?.qtd !== x.para?.qtd ? ` ${x.de?.qtd}→${x.para?.qtd} un` : "";
    const p = x.de?.pesoKg != null && x.de?.pesoKg !== x.para?.pesoKg ? ` ${x.de.pesoKg}→${x.para.pesoKg} kg` : "";
    return `${x.marca}${q}${p}`;
  };
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-wide ${cor} mb-1.5`}>{titulo} · {n}</p>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((x, i) => (
          <span key={i} className={`text-[11px] font-mono border rounded px-1.5 py-0.5 ${fundo}`}>{rotulo(x)}</span>
        ))}
        {n > itens.length && (
          <span className="text-[11px] text-gray-500 px-1.5 py-0.5">+{n - itens.length} na planilha</span>
        )}
      </div>
    </div>
  );
}

/**
 * A LPC e a LE do cliente: a tabela para reconhecer, a planilha para conferir.
 *
 * ⚠ a coluna de peso só existe quando a obra liberou (mostrarPeso): estrutura se cota por R$/kg,
 * e o peso item a item entrega a base do nosso preço.
 */
function BlocoLista({ icone, titulo, fonte, d, token }) {
  const r = d.revisao;
  const sub = [
    plural(d.total, "item", "itens"),
    d.comPeso ? fmtKg(d.pesoKg) : null,
    r?.rotulo ? `rev. ${r.rotulo}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Bloco icone={icone} titulo={titulo} recolhida sub={sub}
      acaoFixa={
        <a href={`/api/portal/${token}/lista?fonte=${fonte}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#006EAB] border border-[#006EAB]/30 rounded-lg px-3 py-1.5 hover:bg-[#006EAB]/5">
          <FileSpreadsheet size={14} /> Baixar planilha
        </a>
      }>
      {r?.mudou && (
        <p className="text-[12px] text-gray-600 bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mb-4">
          {r.rotulo ? <>Esta é a revisão {r.rotulo}, de{" "}</> : <>Lista atualizada em{" "}</>}
          {new Date(r.publicadaEm).toLocaleDateString("pt-BR")} — a planilha acima já sai atualizada.
        </p>
      )}
      <Tabela
        quebra={[1]} larguraMin={d.comPeso ? 620 : 520}
        cols={["Marca", "Descrição", "Material", "Qtd.", ...(d.comPeso ? ["Peso"] : [])]}
        linhas={d.itens.slice(0, 200).map((p) => [
          // ⚠ a peça do conjunto entra RECUADA e em cinza: a LPC é "lista de peças POR CONJUNTO", e
          // é o recuo que mostra o que compõe o quê. Chapada, ela vira um índice de marcas.
          <span key="m" className={p.nivel ? "font-mono text-gray-500 pl-4" : "font-mono font-semibold"}>{p.marca}</span>,
          <span key="d" className={p.nivel ? "text-gray-500" : ""}>{p.descricao}</span>,
          p.material || "—", p.qtd,
          ...(d.comPeso ? [fmtKg(p.pesoKg)] : []),
        ])}
        rodape={d.total > 200 ? `A tela mostra as primeiras 200 marcas — a planilha traz as ${d.total}.` : null}
      />
    </Bloco>
  );
}

function Bloco({ icone: Icone, titulo, sub, children, recolhida = false, acao = null, acaoFixa = null }) {
  const [aberta, setAberta] = useState(!recolhida);
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <button onClick={() => setAberta((v) => !v)} className="flex items-center gap-2.5 min-w-0 text-left group">
          {aberta
            ? <ChevronDown size={17} className="text-[#006EAB] shrink-0" />
            : <ChevronRight size={17} className="text-[#006EAB] shrink-0" />}
          <Icone size={18} className="text-[#006EAB] shrink-0" />
          <h2 className="text-xl font-bold group-hover:text-[#006EAB] transition-colors">{titulo}</h2>
          {sub && <span className="text-[12px] text-gray-500 truncate">{sub}</span>}
        </button>
        {/* ⚠ `acaoFixa` aparece com o bloco FECHADO. É onde mora o botão de baixar a lista:
            esconder o download atrás de um clique de "abrir" é esconder o download. `acao` (a
            seleção de certificados) continua só com o bloco aberto — ela depende do que está
            marcado na tabela, que fechada não existe. */}
        {(acaoFixa || (aberta && acao)) && (
          <div className="ml-auto shrink-0 flex items-center gap-2">{acaoFixa}{aberta ? acao : null}</div>
        )}
      </div>
      {aberta && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_12px_rgba(13,31,60,0.05)] p-5 sm:p-6">
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * ⚠ rolagem horizontal PRÓPRIA: no celular a tabela não pode empurrar a página inteira.
 *
 * ⚠ E SÓ UMA COLUNA QUEBRA. Vitor (22/08/2026), sobre a tabela de materiais: "nessa parte está
 * quebrada" — o "R 260787" saía partido em duas linhas e o "Atendido do estoque" também. A causa é
 * o próprio HTML: com uma descrição de material longa disputando espaço, o navegador espreme as
 * colunas curtas até elas partirem no meio. Rastreio partido é grave: o R é o número que amarra a
 * peça ao certificado, e lido em duas linhas ele parece dois.
 *
 * A regra: `quebra` diz quais colunas PODEM quebrar (a descrição). Todas as outras ficam inteiras,
 * e quando não couber a tabela rola de lado — que é o comportamento certo, porque rolar mostra o
 * número inteiro e quebrar não.
 */
function Tabela({ cols, linhas, rodape, quebra = null, larguraMin = 420 }) {
  const inteiro = (j) => (quebra && !quebra.includes(j) ? " whitespace-nowrap" : "");
  return (
    <>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px]" style={{ minWidth: larguraMin }}>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              {cols.map((c, j) => <th key={c} className={`font-semibold pb-2 px-1${inteiro(j)}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((l, i) => (
              <tr key={i}>
                {l.map((c, j) => <td key={j} className={`py-2 px-1 align-top${inteiro(j)}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rodape && <p className="text-[12px] text-gray-500 mt-3">{rodape}</p>}
    </>
  );
}

// ─── O PARECER DO CLIENTE SOBRE O DATA BOOK ───────────────────────────────────────────────────
// Vitor (31/08/2026): "no caso da OP-106 quero que apareça para o Davi avaliar antes de mandar
// para assinatura. Depois do ok dele aí sim subimos para assinatura".
//
// ⚠ O NOME É OBRIGATÓRIO E O "PEDIR AJUSTE" EXIGE MOTIVO. O portal é aberto por link, sem login —
// sem o nome, o registro diria apenas que "alguém do cliente aprovou", que não serve como aceite.
// E um "não" sem motivo devolve o livro à Qualidade sem dizer o que corrigir: vira uma ida e volta
// a mais, justamente o que esta etapa existe para evitar.
//
// ⚠⚠ APROVAR NÃO É ASSINAR. Aqui ele diz "as informações estão certas, podem seguir"; a assinatura
// dele continua sendo a 4ª etapa da cadeia, depois. O texto do botão precisa deixar isso claro —
// se ele achar que já assinou, não assina depois.
function AvaliacaoDataBook({ token, dados }) {
  const [nome, setNome] = useState("");
  const [obs, setObs] = useState("");
  const [modo, setModo] = useState(null); // "ok" | "ajuste"
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(dados.avaliacaoOkEm ? "ok" : null);

  async function enviar(aprovado) {
    if (nome.trim().length < 2) return setErro("Informe seu nome para registrarmos quem conferiu.");
    if (!aprovado && obs.trim().length < 3) return setErro("Escreva o que precisa ser ajustado.");
    setEnviando(true); setErro("");
    try {
      const q = typeof window !== "undefined" ? window.location.search : "";
      const r = await fetch(`/api/portal/${token}/databook-avaliacao${q}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprovado, nome, obs: obs || null }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Não foi possível registrar.");
      setPronto(aprovado ? "ok" : "ajuste");
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  if (pronto === "ok") {
    return (
      <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-900">
        Conferência registrada{dados.avaliacaoOkNome ? ` por ${dados.avaliacaoOkNome}` : ""}
        {dados.avaliacaoOkEm ? ` em ${dados.avaliacaoOkEm}` : ""}. Vamos emitir o dossiê e colher as
        assinaturas — você receberá o link para assinar como última etapa, e a versão final fica
        disponível aqui.
      </p>
    );
  }
  if (pronto === "ajuste") {
    return (
      <p className="mt-3 rounded-xl border border-[#F4801F]/40 bg-[#FFF8F0] px-4 py-3 text-[12px] text-[#0D1F3C]">
        Recebemos seu apontamento. A Qualidade da Torg vai corrigir o rascunho e devolvê-lo para
        sua conferência antes de emitir o dossiê.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-4">
      <p className="text-[13px] font-semibold text-[#0D1F3C]">Seu retorno</p>
      <label className="mt-2 block text-[12px] text-gray-600">
        Nome de quem conferiu
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-[#006EAB] focus:outline-none focus:ring-1 focus:ring-[#006EAB]" />
      </label>
      {modo === "ajuste" && (
        <label className="mt-3 block text-[12px] text-gray-600">
          O que precisa ser ajustado
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3}
            placeholder="Descreva o ponto — seção, documento ou informação"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-[#006EAB] focus:outline-none focus:ring-1 focus:ring-[#006EAB]" />
        </label>
      )}
      {erro && <p className="mt-2 text-[12px] text-red-600">{erro}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={enviando} onClick={() => enviar(true)}
          className="rounded-lg bg-[#006EAB] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0D1F3C] disabled:opacity-50">
          {enviando ? "Registrando…" : "Está tudo certo — podem emitir"}
        </button>
        {modo === "ajuste" ? (
          <button type="button" disabled={enviando} onClick={() => enviar(false)}
            className="rounded-lg border border-[#F4801F] px-4 py-2 text-[13px] font-semibold text-[#F4801F] hover:bg-[#FFF8F0] disabled:opacity-50">
            Enviar apontamento
          </button>
        ) : (
          <button type="button" onClick={() => { setModo("ajuste"); setErro(""); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
            Preciso de um ajuste
          </button>
        )}
      </div>
    </div>
  );
}
