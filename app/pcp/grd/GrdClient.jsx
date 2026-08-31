"use client";
// GRD — Controle de liberação de desenhos. Uma aba própria no PCP (Vitor 19/08): todas as OPs
// que já tiveram desenho impresso, com as liberações, as reimpressões e o R que estava carimbado
// no papel. É o que garante a rastreabilidade: quem levou qual desenho, quando, com qual material.
//
// A GRD só nasce na IMPRESSÃO; reimprimir a mesma peça soma no contador da mesma linha.
// O `resumoR` vem do SNAPSHOT gravado na emissão — se o CMR mudar depois, o que foi pro chão de
// fábrica continua provado aqui.
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  Loader2, FileDown, Printer, ChevronRight, ChevronDown, Search, RefreshCw,
  ShieldCheck, AlertTriangle, ExternalLink, BookCheck, FileText,
} from "lucide-react";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } from "@/lib/excel-relatorio";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtDH = (d) => (d ? `${new Date(d).toLocaleDateString("pt-BR")} ${new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "—");

export default function GrdClient() {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(null); // opNumero expandida
  const [detalhe, setDetalhe] = useState({}); // opNumero → { linhas, op }
  const [carregando, setCarregando] = useState("");
  // Desenho aberto a partir da GRD: quando uma marca dá problema, é daqui que se abre pra ver
  // do que se trata (croqui ou conjunto). (Vitor 19/08.)
  const [desenho, setDesenho] = useState(null); // { opNumero, opId, marca, setor }

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/pcp/grd");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j);
    } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function abrir(opNumero) {
    if (aberta === opNumero) return setAberta(null);
    setAberta(opNumero);
    if (detalhe[opNumero]) return;
    setCarregando(opNumero);
    try {
      const r = await fetch(`/api/pcp/grd?opNumero=${encodeURIComponent(opNumero)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setDetalhe((d) => ({ ...d, [opNumero]: j }));
    } catch (e) { setErro(e.message); } finally { setCarregando(""); }
  }

  const ops = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = data?.ops || [];
    return q ? lista.filter((o) => `${o.opNumero} ${o.obra || ""} ${o.cliente || ""}`.toLowerCase().includes(q)) : lista;
  }, [data, busca]);

  const abrirPdf = (itemId, nome) => window.open(`/api/producao/desenhos/arquivo?itemId=${encodeURIComponent(itemId)}&nome=${encodeURIComponent(nome)}`, "_blank");

  // ─── EMITIR A GUIA (FORM 09) ────────────────────────────────────────────────────────────────
  // Vitor (31/08/2026): "precisamos que gere essa mesma estrutura para o PCP, onde criamos a aba de
  // GRD" e "preciso de uma forma de registrar a assinatura de quem deve receber".
  //
  // ⚠ O EXCEL AO LADO É OUTRA COISA. Ele é o CONTROLE — relatório gerencial de tudo que já foi
  // liberado. A guia é o documento de UMA remessa, numerado, que o setor assina ao receber. Um não
  // substitui o outro: numa auditoria, o controle mostra o histórico e a guia prova a entrega.
  const [emitindo, setEmitindo] = useState(false);

  async function emitirGuia(opNumero) {
    const nome = prompt("Quem recebe esta remessa? (nome)");
    if (!nome) return;
    const email = prompt("E-mail de quem recebe — deixe em branco para assinar no papel:");
    if (!confirm(
      `Emitir a guia de remessa da OP-${opNumero}?\n\n` +
      "Entram os desenhos liberados que ainda não saíram em guia." +
      (email
        ? "\n\nA guia sai com o recebimento preenchido: remetida a essa pessoa, com data e hora."
        : "\n\nSem e-mail, a guia sai com a linha para assinar à mão.")
    )) return;
    setEmitindo(true);
    try {
      const r = await fetch("/api/pcp/grd/remessa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero, para: email ? { nome, email } : null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      alert(
        `${j.codigo} emitida com ${j.docs} documento(s).` +
        (j.enviado
          ? `\n\nRemetida a ${j.recebidoPor} (${email}) — o recebimento já consta na guia.`
          : "\n\nImprima a guia e colha a assinatura no papel.")
      );
    } catch (e) { alert(e.message); } finally { setEmitindo(false); }
  }

  // Excel do controle: a OP aberta (se houver) ou o resumo de todas.
  async function exportar() {
    const hoje = new Date().toISOString().split("T")[0];
    const det = aberta ? detalhe[aberta] : null;
    if (det) {
      const headers = ["Marca", "Arquivo", "Formato", "Setor", "Rastreabilidade carimbada", "Impressões", "1ª impressão", "Última impressão", "Liberado por", "No Data Book"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `GRD — liberação de desenhos · OP-${det.op.numero}`,
        subtitulo: `${det.op.obra || ""}${det.op.cliente ? ` · ${det.op.cliente}` : ""} · ${det.linhas.length} liberação(ões)`,
        kpis: [`${fmtN(det.linhas.length)} GRD`, `${fmtN(det.linhas.reduce((a, l) => a + (l.impressoes || 1), 0))} impressões`],
        totalColunas: headers.length, nomePlanilha: "GRD", codigoDoc: "REL-PCP-005",
      });
      ws.columns = [{ width: 18 }, { width: 40 }, { width: 13 }, { width: 14 }, { width: 42 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 13 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, headers); row++;
      const first = row;
      for (const l of det.linhas) {
        adicionarLinhaTabela(ws, row, [
          l.marca, l.arquivo, l.formato || "", l.setor || "", l.resumoR?.texto || "—",
          l.impressoes || 1, fmtDH(l.createdAt), fmtDH(l.ultimaImpressaoEm || l.createdAt),
          l.liberadoPorNome || "—", l.documentoId ? "sim" : "não",
        ], { alinhamento: { 2: "center", 3: "center", 5: "center", 6: "center", 7: "center", 9: "center" } });
        row++;
      }
      if (row > first) adicionarLinhaTotais(ws, row, ["TOTAL", "", "", "", "", { formula: `SUM(F${first}:F${row - 1})` }, "", "", "", ""]);
      await downloadWorkbook(workbook, `GRD_OP-${det.op.numero}_${hoje}.xlsx`);
      return;
    }
    const headers = ["OP", "Obra", "Cliente", "Marcas liberadas", "Marcas na OP", "GRDs", "Impressões", "Setores", "No Data Book", "Última impressão"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: "GRD — controle de liberação de desenhos",
      subtitulo: `${ops.length} OP(s) com desenho liberado`,
      kpis: [`${fmtN(data?.totais?.grds)} GRD`, `${fmtN(data?.totais?.impressoes)} impressões`, `${fmtN(data?.totais?.ops)} OPs`],
      totalColunas: headers.length, nomePlanilha: "GRD", codigoDoc: "REL-PCP-005",
    });
    ws.columns = [{ width: 10 }, { width: 26 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 26 }, { width: 13 }, { width: 18 }];
    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, headers); row++;
    const first = row;
    for (const o of ops) {
      adicionarLinhaTabela(ws, row, [
        `OP-${o.opNumero}`, o.obra || "", o.cliente || "", o.marcas, o.marcasNaOp ?? "", o.grds, o.impressoes,
        o.setores.join(", "), o.noDataBook, fmtDH(o.ultimaEm),
      ], { alinhamento: { 3: "center", 4: "center", 5: "center", 6: "center", 8: "center", 9: "center" } });
      row++;
    }
    if (row > first) adicionarLinhaTotais(ws, row, ["TOTAL", "", "", "", "", { formula: `SUM(F${first}:F${row - 1})` }, { formula: `SUM(G${first}:G${row - 1})` }, "", "", ""]);
    await downloadWorkbook(workbook, `GRD_controle_${hoje}.xlsx`);
  }

  const th = "text-left px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-torg-gray";
  const td = "px-3 py-2";

  return (
    <div className="p-6 max-w-[1500px]">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark inline-flex items-center gap-2"><Printer size={22} className="text-torg-blue" /> GRD — liberação de desenhos</h1>
          <p className="text-[13px] text-torg-gray mt-0.5">
            Quem levou qual desenho pro chão de fábrica, quando, e com qual material carimbado. A GRD nasce na <b>impressão</b>; reimprimir a mesma peça soma no contador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 inline-flex items-center gap-1"><RefreshCw size={13} /> Atualizar</button>
          <button onClick={exportar} disabled={!data} className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><FileDown size={13} /> Exportar</button>
          {aberta && (
            <button onClick={() => emitirGuia(aberta)} disabled={emitindo}
              title="Emite a guia de remessa (FORM 09) desta OP e manda para quem recebe confirmar"
              className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-2.5 py-1.5 hover:bg-torg-dark disabled:opacity-40 inline-flex items-center gap-1">
              {emitindo ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} Emitir guia
            </button>
          )}
        </div>
      </div>

      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Kpi rot="OPs com desenho liberado" val={fmtN(data.totais.ops)} />
          <Kpi rot="GRDs registradas" val={fmtN(data.totais.grds)} />
          <Kpi rot="Impressões (com reimpressões)" val={fmtN(data.totais.impressoes)} />
          <Kpi rot="Amarradas no Data Book" val={fmtN(data.totais.noDataBook)} />
        </div>
      )}

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-2.5 text-torg-gray" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por OP, obra ou cliente…"
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-[13px]" />
      </div>

      {!data && !erro && <div className="py-16 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin" /></div>}

      {data && !ops.length && (
        <p className="text-sm text-torg-gray py-10 text-center bg-white rounded-xl border border-gray-100">
          {busca ? "Nenhuma OP no filtro." : "Nenhum desenho foi impresso pelo portal ainda — a GRD é registrada no botão “Imprimir (GRD)” do modal de desenhos."}
        </p>
      )}

      {ops.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="w-8" />
                <th className={th}>OP</th>
                <th className={th}>Obra / cliente</th>
                <th className={`${th} text-right`}>Marcas liberadas</th>
                <th className={`${th} text-right`}>GRDs</th>
                <th className={`${th} text-right`}>Impressões</th>
                <th className={th}>Setores</th>
                <th className={`${th} text-center`} title="Liberações cujo PDF carimbado está amarrado na Seção 02 do Data Book">Data Book</th>
                <th className={th}>Última impressão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ops.map((o) => {
                const open = aberta === o.opNumero;
                const det = detalhe[o.opNumero];
                return (
                  <Fragment key={o.opNumero}>
                    <tr className={`hover:bg-gray-50 cursor-pointer ${open ? "bg-blue-50/40" : ""}`} onClick={() => abrir(o.opNumero)}>
                      <td className="pl-3 text-torg-gray">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className={`${td} font-bold whitespace-nowrap`}>OP-{o.opNumero}</td>
                      <td className={td}>
                        <span className="font-medium">{o.obra || "—"}</span>
                        {o.cliente && <span className="text-torg-gray"> · {o.cliente}</span>}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>
                        <b>{fmtN(o.marcas)}</b>{o.marcasNaOp ? <span className="text-torg-gray"> / {fmtN(o.marcasNaOp)}</span> : ""}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{fmtN(o.grds)}</td>
                      <td className={`${td} text-right tabular-nums ${o.impressoes > o.grds ? "font-semibold text-torg-dark" : ""}`}>{fmtN(o.impressoes)}</td>
                      <td className={`${td} text-[12px] text-torg-gray`}>{o.setores.length ? o.setores.join(" · ") : "—"}</td>
                      <td className={`${td} text-center`}>
                        {o.noDataBook === o.grds
                          ? <span className="text-emerald-700 bg-emerald-50 text-[10px] rounded px-1.5 py-0.5 font-semibold inline-flex items-center gap-0.5"><BookCheck size={10} /> {fmtN(o.noDataBook)}</span>
                          : <span className="text-amber-700 bg-amber-50 text-[10px] rounded px-1.5 py-0.5 font-semibold" title="Nem toda liberação tem o PDF carimbado amarrado ao Data Book">{fmtN(o.noDataBook)}/{fmtN(o.grds)}</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums text-torg-gray`}>{fmtDH(o.ultimaEm)}</td>
                    </tr>

                    {open && (
                      <tr className="bg-gray-50/60">
                        <td />
                        <td colSpan={8} className="px-3 pb-4 pt-1">
                          {carregando === o.opNumero && <p className="text-[12px] text-torg-gray py-3 inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Carregando…</p>}
                          {det && <Detalhe det={det} abrirPdf={abrirPdf} onVerDesenho={setDesenho} />}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-torg-gray mt-3">
        A coluna <b>Rastreabilidade carimbada</b> é o <b>snapshot</b> gravado no momento da emissão — é o R que foi impresso no papel. Se o CMR mudar depois, o que o setor recebeu continua registrado aqui.
        Clique na <b>marca</b> pra abrir o desenho (croqui ou conjunto) e ver do que se trata.
      </p>

      {desenho && (
        <DesenhoPecaModal opNumero={desenho.opNumero} opId={desenho.opId} marca={desenho.marca} setor={desenho.setor} soImprimir onClose={() => setDesenho(null)} />
      )}
    </div>
  );
}

function Kpi({ rot, val }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
      <p className="text-[10px] uppercase text-torg-gray tracking-wide">{rot}</p>
      <p className="text-xl font-extrabold text-torg-dark tabular-nums">{val}</p>
    </div>
  );
}

function Detalhe({ det, abrirPdf, onVerDesenho }) {
  const [q, setQ] = useState("");
  const linhas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? det.linhas.filter((l) => `${l.marca} ${l.arquivo} ${l.setor || ""} ${l.resumoR?.texto || ""}`.toLowerCase().includes(t)) : det.linhas;
  }, [det.linhas, q]);
  const verDesenho = (l) => onVerDesenho({ opNumero: det.op.numero, opId: det.op.id || null, marca: l.marca, setor: l.setor || null });
  return (
    <div className="space-y-3">
      {det.linhas.length > 8 && (
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-2.5 top-2 text-torg-gray" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Achar a marca…"
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-[12px]" />
        </div>
      )}

      {!linhas.length ? (
        <p className="text-[12px] text-torg-gray py-2">{q ? "Nenhuma marca no filtro." : "Nenhuma liberação registrada nesta OP."}</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-100 overflow-x-auto">
          <table className="w-full text-[12px] min-w-[1000px]">
            <thead>
              <tr className="text-[10px] uppercase text-torg-gray border-b border-gray-100 bg-gray-50/70">
                <th className="text-left px-2.5 py-1.5">Marca</th>
                <th className="text-left px-2.5 py-1.5">Arquivo</th>
                <th className="text-left px-2.5 py-1.5">Formato</th>
                <th className="text-left px-2.5 py-1.5">Setor</th>
                <th className="text-left px-2.5 py-1.5">Rastreabilidade carimbada</th>
                <th className="text-right px-2.5 py-1.5">Impressões</th>
                <th className="text-left px-2.5 py-1.5">1ª</th>
                <th className="text-left px-2.5 py-1.5">Última</th>
                <th className="text-left px-2.5 py-1.5">Por</th>
                <th className="text-center px-2.5 py-1.5">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50/60">
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    {/* Abre o desenho da marca (croqui/conjunto) — é como se entende o problema. */}
                    <button onClick={() => verDesenho(l)} title="Abrir os desenhos desta marca (croqui ou conjunto)"
                      className="font-mono font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
                      <FileText size={11} /> {l.marca}
                    </button>
                  </td>
                  <td className="px-2.5 py-1.5 truncate max-w-[240px]" title={l.arquivo}>{l.arquivo}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{l.formato || "—"}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{l.setor || "—"}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-mono">
                    {l.resumoR?.rs?.length
                      ? <span className="text-emerald-800">{l.resumoR.texto}</span>
                      : <span className="text-amber-700 font-sans inline-flex items-center gap-1"><AlertTriangle size={10} /> sem R no papel</span>}
                  </td>
                  {/* ⚠ o contador vira a LISTA das cópias na dica: "3" não prova nada; "3 cópias,
                      estas horas, por estas pessoas" é o que uma GRD tem de responder. */}
                  <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold"
                      title={l.copias?.length
                        ? l.copias.map((c, i) => `${l.copias.length - i}ª · ${fmtDH(c.em)} · ${c.por || "—"}${c.rs?.length ? " · R " + c.rs.join(", ") : ""}`).join("\n")
                        : "sem histórico por cópia (impressão anterior a 26/08/2026)"}>
                    {fmtN(l.impressoes || 1)}
                    {l.copias?.length > 1 && <span className="ml-1 text-[9px] text-torg-blue align-super">•</span>}
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap tabular-nums text-torg-gray">{fmtDH(l.createdAt)}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap tabular-nums">{fmtDH(l.ultimaImpressaoEm || l.createdAt)}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{l.liberadoPorNome || "—"}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    {l.impressoItemId ? (
                      <button onClick={() => abrirPdf(l.impressoItemId, `${l.marca} rastreado.pdf`)} title="Abrir o PDF carimbado que foi impresso (o mesmo do Data Book)"
                        className="text-torg-blue hover:underline inline-flex items-center gap-1 font-semibold"><ExternalLink size={11} /> carimbado</button>
                    ) : (
                      <button onClick={() => verDesenho(l)} title="Esta liberação é anterior ao carimbo — abre os desenhos da marca"
                        className="text-torg-gray hover:text-torg-blue hover:underline inline-flex items-center gap-1"><FileText size={11} /> desenhos</button>
                    )}
                    {l.documentoId && <ShieldCheck size={11} className="inline ml-1 text-emerald-600" title="Amarrado na Seção 02 do Data Book" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
