"use client";
import { useEffect, useState } from "react";
import {
  Loader2, AlertCircle, ShieldCheck, CalendarRange, FileText, Award,
  BookCheck, Layers, Image as ImageIcon, ChevronRight,
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
    dados.certificados?.length && { v: dados.certificados.length, r: "certificados de material" },
    dados.relatorios?.length && { v: dados.relatorios.length, r: "relatórios de inspeção aprovados" },
    dados.lpc?.totalConjuntos && { v: dados.lpc.totalConjuntos, r: "conjuntos fabricados" },
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
          <div className="flex items-center gap-5 mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torg-logo-white.png" alt="Torg Metal" className="h-9"
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
            {portal.logoClienteUrl && (
              <>
                <span className="h-8 w-px bg-white/25" />
                <span className="bg-white rounded-lg px-3 py-2 inline-flex items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={portal.logoClienteUrl} alt={op.cliente || "Cliente"} className="h-7 object-contain"
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

      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14 space-y-12">
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

        {tem("RELATORIOS") && dados.relatorios?.length > 0 && (
          <Bloco icone={FileText} titulo="Relatórios de inspeção"
            sub={`${dados.relatorios.length} aprovados`}>
            {/* ⚠ SÓ OS APROVADOS. Relatório em rascunho ou reprovado é trabalho em curso;
                mostrá-lo sem o reparo ao lado seria entregar meia história. */}
            <Tabela
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

        {tem("CERTIFICADOS") && dados.certificados?.length > 0 && (
          <Bloco icone={Award} titulo="Certificados de qualidade"
            sub={`${dados.certificados.length} materiais com rastreabilidade`}>
            <Tabela
              cols={["Material", "Certificado", "Corrida", "Fornecedor"]}
              linhas={dados.certificados.slice(0, 60).map((c) => [
                c.material, c.certificado || "—", c.corrida || "—", c.fornecedor || "—",
              ])}
              rodape={dados.certificados.length > 60 ? `e mais ${dados.certificados.length - 60} — a lista completa está no Data Book.` : null}
            />
          </Bloco>
        )}

        {tem("DATABOOK") && dados.databook?.volumes?.length > 0 && (
          <Bloco icone={BookCheck} titulo="Data Book da obra"
            sub={`${dados.databook.volumes.length} volume(s) · R${String(dados.databook.revisao).padStart(2, "0")}`}>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {dados.databook.volumes.map((v) => (
                <div key={v.volume} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[11px] font-bold text-white bg-[#0D1F3C] rounded px-2 py-1 shrink-0">
                    {String(v.volume).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium truncate">{v.titulo || "Anexos"}</span>
                    <span className="block text-[11px] text-gray-500">
                      {Number(v.paginas).toLocaleString("pt-BR")} páginas · {fmtMB(v.tamanho)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-gray-500 mt-3">
              O dossiê completo é entregue pelo link de aceite, ao fim da obra.
            </p>
          </Bloco>
        )}

        {tem("LPC") && dados.lpc && (
          <Bloco icone={Layers} titulo="Lista de peças"
            sub={`${dados.lpc.totalConjuntos || dados.lpc.totalPecas} itens · ${fmtKg(dados.lpc.pesoKg)}`}>
            <Tabela
              cols={["Marca", "Descrição", "Qtd.", "Peso"]}
              linhas={dados.lpc.itens.slice(0, 60).map((p) => [
                <span key="m" className="font-mono">{p.marca}</span>, p.descricao || "—", p.qtd, fmtKg(p.pesoKg),
              ])}
              rodape={dados.lpc.itens.length > 60 ? `e mais ${dados.lpc.itens.length - 60} itens.` : null}
            />
          </Bloco>
        )}

        {tem("DOCUMENTOS") && dados.documentos?.length > 0 && (
          <Bloco icone={FileText} titulo="Documentos da obra"
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
                      <div key={doc.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-1.5">
                        <ChevronRight size={12} className="text-[#006EAB] shrink-0" />
                        <span className="text-[12px] truncate">{doc.nome}</span>
                      </div>
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

function Bloco({ icone: Icone, titulo, sub, children }) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5 mb-4">
        <Icone size={18} className="text-[#006EAB] shrink-0 translate-y-0.5" />
        <h2 className="text-xl font-bold">{titulo}</h2>
        {sub && <span className="text-[12px] text-gray-500">{sub}</span>}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_12px_rgba(13,31,60,0.05)] p-5 sm:p-6">
        {children}
      </div>
    </section>
  );
}

/** ⚠ rolagem horizontal PRÓPRIA: no celular a tabela não pode empurrar a página inteira. */
function Tabela({ cols, linhas, rodape }) {
  return (
    <>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px] min-w-[420px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              {cols.map((c) => <th key={c} className="font-semibold pb-2 px-1">{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((l, i) => (
              <tr key={i}>
                {l.map((c, j) => <td key={j} className="py-2 px-1 align-top">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rodape && <p className="text-[12px] text-gray-500 mt-3">{rodape}</p>}
    </>
  );
}
