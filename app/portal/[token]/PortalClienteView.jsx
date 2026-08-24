"use client";
import { useEffect, useState } from "react";
import {
  Loader2, AlertCircle, ShieldCheck, CalendarRange, FileText, Award,
  BookCheck, Layers, Image as ImageIcon, ChevronRight, ChevronDown,
  Download, Package, ShoppingCart, Truck, Check, FileSpreadsheet, History,
} from "lucide-react";

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

  useEffect(() => {
    fetch(`/api/portal/${token}`)
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

  // os números que sustentam a mensagem — só entram os que existem de verdade
  const numeros = [
    // ⚠ contagem de certificado NAO entra aqui. Vitor (22/08/2026), apontando o "23 certificados
    // de material" na capa: "tire essa informação". Numero de certificado na capa vira promessa
    // — o cliente le como "a obra tem 23" e cobra os 23; e o que existe hoje e o que ja foi
    // emitido, que cresce enquanto a obra anda. A seção de Certificados mostra a lista real.
    dados.relatorios?.length && { v: dados.relatorios.length, r: "relatórios de inspeção aprovados" },
    dados.lpc?.totalConjuntos && { v: dados.lpc.totalConjuntos, r: "conjuntos fabricados" },
    // ⚠ o peso total só entra quando a obra liberou o peso — ver mostrarPeso em lib/portal-cliente
    dados.lpc?.pesoKg && { v: fmtKg(dados.lpc.pesoKg), r: "de estrutura" },
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

      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14 space-y-12">
        {/* ⚠ A ORDEM É A DO PROCESSO. Vitor (22/08/2026): "sempre começar com os documentos da
            Engenharia LPC e LE, depois Tabela de compras". Faz sentido: a Engenharia define o que
            será fabricado, o Compras traz o material, a Qualidade prova que está conforme. O
            cliente lê a obra na ordem em que ela acontece. */}
        {tem("LPC") && dados.lpc && (
          <BlocoLista icone={Layers} titulo="Lista de produção (LPC)" fonte="LPC" d={dados.lpc} token={token} />
        )}

        {tem("LE") && dados.le && (
          <BlocoLista icone={Truck} titulo="Lista de expedição (LE)" fonte="LE" d={dados.le} token={token} />
        )}

        {tem("COMPRAS") && dados.compras?.itens?.length > 0 && (
          <Bloco icone={ShoppingCart} titulo="Materiais da obra" recolhida
            sub={`${dados.compras.recebidos} de ${dados.compras.total} recebidos`}>
            <Tabela
              quebra={[0]} larguraMin={780}
              cols={["Material", "Qtd.", "Situação", "Pedido", "Chegou em", "NF", "Rastreio"]}
              linhas={dados.compras.itens.slice(0, 200).map((c) => [
                c.material, c.qtd,
                <span key="s" className={c.status === "Recebido" ? "text-emerald-700 font-semibold" : ""}>{c.status}</span>,
                c.pedido || "—", fmtD(c.chegouEm), c.nf || "—",
                c.rastreio ? <span key="r" className="font-mono text-[#006EAB]">R {c.rastreio}</span> : "—",
              ])}
              rodape={dados.compras.itens.length > 200 ? `e mais ${dados.compras.itens.length - 200} itens.` : null}
            />
          </Bloco>
        )}

        {tem("CRONOGRAMA") && dados.cronograma && (
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
        {tem("CERTIFICADOS") && dados.certificados?.length > 0 && (
          <Certificados token={token} lista={dados.certificados} />
        )}

        {tem("RELATORIOS") && dados.relatorios?.length > 0 && (
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
        {tem("DATABOOK") && dados.databook?.volumes?.length > 0 && (
          <Bloco icone={BookCheck} titulo="Data Book da obra"
            sub={`${dados.databook.volumes.length} volume(s) · R${String(dados.databook.revisao).padStart(2, "0")}`}>
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
            <p className="text-[12px] text-gray-500 mt-3">
              Dossiê aceito{dados.databook.aceiteEm ? ` em ${dados.databook.aceiteEm}` : ""} · revisão R{String(dados.databook.revisao).padStart(2, "0")}.
              Cada volume abre em PDF.
            </p>
          </Bloco>
        )}
        {tem("DOCUMENTOS") && dados.documentos?.length > 0 && (
          <Bloco icone={FileText} titulo="Documentos da obra" recolhida
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
                      <a key={doc.id} href={`/api/portal/${token}/doc?id=${doc.id}`} target="_blank" rel="noreferrer"
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
        {tem("FOTOS") && portal.fotos?.length > 0 && (
          <Bloco icone={ImageIcon} titulo="A obra em imagens" sub={`${portal.fotos.length} registros`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {portal.fotos.map((f, i) => (
                <figure key={i} className="rounded-xl overflow-hidden border border-gray-100 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.legenda || ""} className="w-full h-40 object-cover" />
                  {f.legenda && <figcaption className="text-[11px] text-gray-500 px-3 py-2">{f.legenda}</figcaption>}
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
            {l.titulo} — {r.daEngenharia ? `revisão ${r.rotulo}` : r.rotulo}
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
    r ? (r.daEngenharia ? `rev. ${r.rotulo}` : r.rotulo) : null,
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
          Esta é a {r.daEngenharia ? `revisão ${r.rotulo}` : r.rotulo.toLowerCase()}, de{" "}
          {new Date(r.publicadaEm).toLocaleDateString("pt-BR")} — a planilha acima já sai atualizada.
        </p>
      )}
      <Tabela
        quebra={[1]} larguraMin={d.comPeso ? 620 : 520}
        cols={["Marca", "Descrição", "Material", "Qtd.", ...(d.comPeso ? ["Peso"] : [])]}
        linhas={d.itens.slice(0, 200).map((p) => [
          <span key="m" className="font-mono">{p.marca}</span>, p.descricao, p.material || "—", p.qtd,
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
