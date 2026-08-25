"use client";
// CARGAS PROGRAMADAS — a lista primeiro, a programação depois.
//
// Vitor (25/08/2026): "quero que mude a forma de visualizar, crie uma maneira mais adequada para
// podermos ver apenas as que estão programadas, não ficando em botões por OP onde fica difícil de
// enxergar; pensei até mesmo em formato de planilha, igual fizemos na planilha de rastreabilidade,
// com filtros e tudo mais".
//
// ⚠⚠ A TELA ESTAVA INVERTIDA. Ela abria com uma grade de botões de TODAS as OPs — 40 cartões
// idênticos — e só depois de escolher uma dava para ver alguma carga. Ou seja: para saber o que
// está programado era preciso entrar OP por OP.
//
// ⚠ E É SÓ DE LEITURA. Vitor (25/08/2026): "vamos tirar essa função nessa tela, deixar apenas na
// tela de romaneios prévios". Criar carga tem UM lugar; dois lugares criando a mesma coisa é como
// nasceram as duas tabelas que esta lista teve de reunir.
//
// ⚠ "Programada" aqui é carga que alguém criou e datou. Carga PREVISTA vinda do cronograma ainda
// não entra: Vitor (25/08) — "alguns cronogramas não terão essa informação, ou seja não precisa
// destacar no momento".
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Truck, Loader2, AlertCircle, ListChecks, FileSpreadsheet, RefreshCw, CalendarClock, ExternalLink,
} from "lucide-react";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import { fmtOP } from "@/lib/utils";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
// ⚠ UTC no fuso: `dataPrevista` é dia de calendário. Sem isso, 25/06 vira 24/06 à noite no Brasil.
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

// ⚠ classes literais: Tailwind não gera classe montada em runtime, e o chip sairia sem cor.
const SIT = {
  PROGRAMADA: { rot: "Programada", chip: "bg-sky-50 text-sky-700 border-sky-200",             faixa: "border-l-sky-400" },
  ATRASADA:   { rot: "Atrasada",   chip: "bg-red-100 text-red-800 border-red-200",            faixa: "border-l-red-500" },
  CONFIRMADA: { rot: "Confirmada", chip: "bg-amber-50 text-amber-700 border-amber-200",       faixa: "border-l-amber-400" },
  EMBARCADA:  { rot: "Embarcada",  chip: "bg-emerald-50 text-emerald-700 border-emerald-200", faixa: "border-l-emerald-500" },
  FATURADA:   { rot: "Faturada",   chip: "bg-emerald-100 text-emerald-800 border-emerald-300",faixa: "border-l-emerald-600" },
  CANCELADA:  { rot: "Cancelada",  chip: "bg-gray-100 text-torg-gray border-gray-200",        faixa: "border-l-gray-300" },
  // ⚠ sem data NÃO é atrasada: é carga que ninguém datou. Cobrar prazo de algo sem prazo é ruído.
  SEM_DATA:   { rot: "Sem data",   chip: "bg-gray-100 text-torg-gray border-gray-200",        faixa: "border-l-gray-300" },
};

const ORIGEM = { PREVIA: "Prévia", PROGRAMACAO: "Programação" };

const COLUNAS = [
  { key: "op",       label: "OP",       valor: (c) => fmtOP(c.opNumero) },
  { key: "cliente",  label: "Cliente",  valor: (c) => c.cliente || "—" },
  { key: "mes",      label: "Mês",      valor: (c) => (c.dataPrevista ? new Date(c.dataPrevista).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "2-digit", year: "numeric" }) : "sem data") },
  { key: "origem",   label: "Origem",   valor: (c) => ORIGEM[c.origem] || c.origem },
  { key: "situacao", label: "Situação", valor: (c) => SIT[c.situacao]?.rot || c.situacao },
];

export default function ProgramacaoCargasPlanejamentoClient() {
  const [cargas, setCargas] = useState(null);
  const [totais, setTotais] = useState(null);
  const [erroLista, setErroLista] = useState("");
  const [col, setCol] = useState(null);
  const [baixando, setBaixando] = useState(false);

  const carregarLista = useCallback(async () => {
    setErroLista("");
    try {
      const r = await fetch("/api/planejamento/cargas", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar as cargas");
      setCargas(j.cargas); setTotais(j.totais);
    } catch (e) { setErroLista(e.message); setCargas([]); }
  }, []);
  useEffect(() => { carregarLista(); }, [carregarLista]);

  const f = useFiltroColunas(cargas || [], COLUNAS);
  const fp = { filtros: f.filtros, setFiltros: f.setFiltros, opcoesDaColuna: f.opcoesDaColuna, aberta: col, setAberta: setCol };

  async function exportar() {
    if (!f.filtradas.length) return;
    setBaixando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO, downloadWorkbook } =
        await import("@/lib/excel-relatorio");
      const cab = ["Data prevista", "OP", "Cliente", "Obra", "Ref. cliente", "Origem", "Romaneio", "Local",
        "Situação", "Dias em atraso", "Itens", "Peso (kg)", "Romaneio emitido", "NF", "Tipo NF", "Remarcada de"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Cargas programadas — Planejamento",
        subtitulo: f.ativos ? `Filtro: ${f.rotulosAtivos.join(", ")}` : "Todas as cargas programadas",
        kpis: [`${fmtN(f.filtradas.length)} carga(s)`, `${fmtN(totais?.atrasadas || 0)} atrasada(s)`, `${fmtKg(totais?.pesoAberto)} em aberto`],
        totalColunas: cab.length, nomePlanilha: "Cargas", codigoDoc: "REL-PLN-002",
      });
      ws.columns = [{ width: 14 }, { width: 10 }, { width: 20 }, { width: 26 }, { width: 16 }, { width: 13 }, { width: 16 },
        { width: 34 }, { width: 13 }, { width: 14 }, { width: 8 }, { width: 13 }, { width: 16 }, { width: 12 }, { width: 11 }, { width: 14 }];
      // ⚠ os helpers NÃO devolvem a próxima linha — contar aqui, senão a planilha sai vazia.
      let l = linhaInicio;
      adicionarHeaderTabela(ws, l, cab); l++;
      for (const c of f.filtradas) {
        adicionarLinhaTabela(ws, l, [
          c.dataPrevista ? fmtD(c.dataPrevista) : "sem data", fmtOP(c.opNumero), c.cliente, c.obra, c.refCliente,
          ORIGEM[c.origem] || c.origem, c.romaneioLabel, c.local, SIT[c.situacao]?.rot || c.situacao,
          c.diasAtraso || "", c.itens, c.pesoKg, c.romaneioEmitido || "", c.nf?.numero || "", c.nf?.tipo || "",
          c.remarcadaDe ? fmtD(c.remarcadaDe) : "",
        ], { alinhamento: { 9: "right", 10: "right", 11: "right" } });
        l++;
      }
      adicionarRodapeISO(ws, l + 1, cab.length);
      await downloadWorkbook(workbook, "Cargas programadas.xlsx");
    } catch (e) { setErroLista(`Não consegui gerar a planilha: ${e?.message || e}`); }
    finally { setBaixando(false); }
  }

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      <div className="bg-torg-dark text-white">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <Truck size={20} className="text-torg-orange" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Cargas</h1>
              <p className="text-xs text-white/70">
                As entregas programadas para as obras. A Expedição certifica e emite o romaneio.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* ⚠ criar carga é na tela de Romaneios prévios — daqui só se olha. Deixo o caminho à
                vista para quem chegou aqui querendo criar não ficar procurando. */}
            <Link href="/planejamento/romaneios-previos"
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg">
              <ExternalLink size={14} /> Romaneios prévios
            </Link>
            <Link href="/expedicao/programacao-cargas"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg">
              <ListChecks size={14} /> Painel da Expedição
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
            {totais && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                <Kpi n={fmtN(totais.programadas)} l="Programadas" sub={totais.semData ? `+ ${fmtN(totais.semData)} sem data` : undefined} cor="text-sky-700" />
                <Kpi n={fmtN(totais.atrasadas)} l="Atrasadas" cor="text-red-700" destaque={totais.atrasadas > 0} />
                <Kpi n={fmtN(totais.confirmadas)} l="Confirmadas" sub="liberadas, ainda não embarcaram" cor="text-amber-700" />
                <Kpi n={fmtN(totais.embarcadas + totais.faturadas)} l="Embarcadas" sub={totais.faturadas ? `${fmtN(totais.faturadas)} já faturada(s)` : undefined} cor="text-emerald-700" />
                <Kpi n={fmtKg(totais.pesoAberto)} l="Peso em aberto" sub="tudo que ainda não embarcou" cor="text-torg-dark" />
              </div>
            )}

            {erroLista && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-3">
                <AlertCircle size={16} /> {erroLista}
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
                <span className="text-[12px] text-torg-gray">
                  {cargas === null ? "carregando…" : `${fmtN(f.filtradas.length)} de ${fmtN(cargas.length)} carga(s)`}
                </span>
                {f.ativos > 0 && (
                  <button onClick={f.limpar} className="text-[11px] text-torg-orange hover:underline">
                    limpar filtro ({f.rotulosAtivos.join(", ")})
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={carregarLista} className="inline-flex items-center gap-1.5 text-[11px] text-torg-gray hover:text-torg-dark border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <RefreshCw size={12} /> Atualizar
                  </button>
                  <button onClick={exportar} disabled={baixando || !f.filtradas.length}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-torg-gray hover:bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 disabled:opacity-40">
                    {baixando ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Planilha
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] uppercase text-torg-gray">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-left">Data</th>
                      <ThFiltro col="op" label="OP" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <ThFiltro col="cliente" label="Cliente" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <th className="px-3 py-2 font-semibold text-left">Obra</th>
                      <th className="px-3 py-2 font-semibold text-left">Romaneio</th>
                      <ThFiltro col="origem" label="Origem" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <th className="px-3 py-2 font-semibold text-right">Itens</th>
                      <th className="px-3 py-2 font-semibold text-right">Peso</th>
                      <ThFiltro col="situacao" label="Situação" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <th className="px-3 py-2 font-semibold text-left">NF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cargas === null && (
                      <tr><td colSpan={10} className="px-3 py-10 text-center"><Loader2 size={20} className="animate-spin mx-auto text-torg-blue" /></td></tr>
                    )}
                    {cargas?.length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-torg-gray">
                        Nenhuma carga programada ainda. Use <b>Nova carga</b> para criar a primeira.
                      </td></tr>
                    )}
                    {cargas?.length > 0 && !f.filtradas.length && (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-torg-gray">Nada com esse filtro.</td></tr>
                    )}
                    {f.filtradas.map((c) => {
                      const s = SIT[c.situacao] || SIT.PROGRAMADA;
                      return (
                        // ⚠ LINHA NÃO CLICA. Vitor (25/08/2026): "a intenção aqui é somente de
                        // consultar as informações, não há necessidade de expandir". Linha que
                        // navega numa tela de consulta tira quem está lendo do lugar sem querer.
                        <tr key={c.id} className={`hover:bg-gray-50/70 border-l-[3px] ${s.faixa}`}>
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                            <span className={c.situacao === "ATRASADA" ? "text-red-600 font-semibold" : c.dataPrevista ? "text-torg-dark" : "text-torg-gray-light"}>{c.dataPrevista ? fmtD(c.dataPrevista) : "sem data"}</span>
                            {/* ⚠ remarcada só aparece quando de fato mudou — é o que separa "atrasou" de "foi empurrada". */}
                            {c.remarcadaDe && <span className="block text-[10px] text-torg-gray-light">era {fmtD(c.remarcadaDe)}</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-torg-blue whitespace-nowrap">{fmtOP(c.opNumero)}</td>
                          <td className="px-3 py-2 text-[12px] text-torg-dark truncate max-w-[18ch]" title={c.cliente}>{c.cliente || "—"}</td>
                          <td className="px-3 py-2 text-[12px] text-torg-gray truncate max-w-[24ch]" title={c.obra}>{c.obra || "—"}</td>
                          <td className="px-3 py-2">
                            <span className="text-[12px] text-torg-dark whitespace-nowrap">{c.romaneioLabel || "—"}</span>
                            {/* ⚠ endereço de obra vem com três linhas — resumido aqui, inteiro na dica. */}
                            {c.local && <span className="block text-[10px] text-torg-gray-light truncate max-w-[26ch]" title={c.local}>{c.local}</span>}
                          </td>
                          {/* ⚠ a origem fica visível porque as duas tabelas se comportam diferente:
                              a prévia vira romaneio e NF; a da programação vira romaneio da carga. */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${c.origem === "PREVIA" ? "bg-torg-blue-50 text-torg-blue border-torg-blue-100" : "bg-gray-50 text-torg-gray border-gray-200"}`}>
                              {ORIGEM[c.origem] || c.origem}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[12px] text-torg-gray whitespace-nowrap">
                            {fmtN(c.itens)}{c.carregados > 0 && <span className="text-torg-gray-light"> · {fmtN(c.carregados)} carreg.</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[12px] text-torg-gray whitespace-nowrap">
                            {c.pesoKg ? fmtKg(c.pesoKg) : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${s.chip}`}>{s.rot}</span>
                            {c.diasAtraso > 0 && <span className="text-[10px] text-red-600 ml-1 tabular-nums">{c.diasAtraso}d</span>}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-torg-gray whitespace-nowrap">
                            {/* ⚠ NF só existe depois que o Fiscal registra: traço é ausência de nota,
                                não erro. A carga pode estar embarcada e ainda sem NF. */}
                            {c.nf
                              ? <span className="font-mono text-emerald-700" title={[c.nf.tipo, c.nf.emitidaEm ? `emitida em ${fmtD(c.nf.emitidaEm)}` : null].filter(Boolean).join(" · ")}>
                                  {c.nf.numero}
                                </span>
                              : <span className="text-torg-gray-light">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Legenda />
      </div>
    </div>
  );
}

// ⚠ A LEGENDA DIZ DE ONDE VEM CADA SITUAÇÃO, não só o que ela significa. Vitor (25/08/2026):
// "crie uma legenda pequena do que significa cada status, no caso de onde ver a informação". Status
// derivado sem origem declarada é o tipo de número que ninguém consegue conferir nem contestar —
// quem discorda da linha precisa saber em qual tela ir mudar.
const LEGENDA = [
  { k: "PROGRAMADA", o: "Romaneio prévio criado com data à frente, ainda não liberado." },
  { k: "ATRASADA",   o: "A data prevista já passou e a carga não foi emitida nem cancelada." },
  { k: "CONFIRMADA", o: "Aprovada em Romaneios prévios — liberada para a Expedição, ainda não saiu." },
  { k: "EMBARCADA",  o: "Romaneio emitido pela Expedição. A carga saiu do pátio." },
  { k: "FATURADA",   o: "NF registrada no módulo Fiscal sobre esse romaneio." },
  { k: "CANCELADA",  o: "Cancelada em Romaneios prévios." },
  { k: "SEM_DATA",   o: "Criada sem data prevista — falta datar em Romaneios prévios." },
];

function Legenda() {
  return (
    <div className="mt-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-torg-gray-light mb-2">O que cada situação quer dizer</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {LEGENDA.map(({ k, o }) => (
          <div key={k} className="flex items-start gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold shrink-0 ${SIT[k].chip}`}>{SIT[k].rot}</span>
            <span className="text-[11px] text-torg-gray leading-snug">{o}</span>
          </div>
        ))}
      </div>
      {/* ⚠ a regra de precedência é o que explica a linha que "deveria estar atrasada e não está" —
          sem ela, a tabela parece errada justamente nos casos em que acerta. */}
      <p className="text-[11px] text-torg-gray-light mt-2.5 pt-2.5 border-t border-gray-50">
        Vale sempre o fato mais forte: faturada ganha de embarcada, que ganha de confirmada. Carga que
        já saiu ou foi cancelada nunca aparece como atrasada.
      </p>
      <p className="text-[11px] text-torg-gray-light mt-1.5 flex items-start gap-1.5">
        <CalendarClock size={12} className="mt-0.5 shrink-0" />
        <span>
          <b>Origem</b> diz de qual lista a carga veio: <b>Prévia</b> é o romaneio prévio do
          Planejamento; <b>Programação</b> é a carga montada por OP no painel da Expedição.
          Datas de embarque que existem só no cronograma ainda não entram.
          {/* ⚠ dito por extenso: linha que some sem explicação vira "sumiu do sistema". */}
          {" "}Carga faturada continua aqui enquanto a obra estiver aberta — sai quando o Comercial
          encerra a OP.
        </span>
      </p>
    </div>
  );
}

function Kpi({ n, l, sub, cor, destaque }) {
  return (
    <div className={`bg-white rounded-xl border p-3 ${destaque ? "border-red-200" : "border-gray-100"}`}>
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{n}</p>
      <p className="text-[11px] text-torg-gray mt-0.5">{l}</p>
      {sub && <p className="text-[10px] text-torg-gray-light">{sub}</p>}
    </div>
  );
}
