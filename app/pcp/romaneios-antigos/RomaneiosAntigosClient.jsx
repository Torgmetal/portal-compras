"use client";
// IMPORTAR ROMANEIOS ANTIGOS — traz pro portal o que foi expedido antes do fluxo novo existir.
//
// Vitor (19/08): "vamos fazer isso, mas apenas para essas obras antigas; para as mais novas vamos
// tentar fazer através do nosso fluxo". Sem isso o portal mostra como pendente peça que já está
// montada na obra do cliente — na OP-060, 43 das 44 "em aberto" já tinham sido embarcadas.
//
// Sempre PRÉVIA antes de gravar: mostra quantos romaneios a pasta tem, quantas marcas casaram com
// as peças do portal e quais não casaram. Só depois o botão de importar aparece.
import { useState } from "react";
import { Loader2, Search, PackageCheck, AlertTriangle, FileSpreadsheet, CheckCircle2, Truck } from "lucide-react";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "sem data");

export default function RomaneiosAntigosClient() {
  const [opNumero, setOpNumero] = useState("");
  const [previa, setPrevia] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);

  async function ver() {
    const n = opNumero.trim();
    if (!n) return;
    setCarregando(true); setErro(""); setPrevia(null); setResultado(null);
    try {
      const r = await fetch(`/api/pcp/romaneios-antigos?opNumero=${encodeURIComponent(n)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setPrevia(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }

  async function importar() {
    if (!previa) return;
    if (!confirm(`Importar ${previa.lidos} romaneio(s) da OP-${previa.op.numero}?\n\n${previa.casadas} marcas serão marcadas como EXPEDIDAS e sairão das filas de produção.`)) return;
    setGravando(true); setErro("");
    try {
      const r = await fetch("/api/pcp/romaneios-antigos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: previa.op.numero }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao importar");
      setResultado(j);
    } catch (e) { setErro(e.message); } finally { setGravando(false); }
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-torg-dark inline-flex items-center gap-2"><Truck size={22} className="text-torg-blue" /> Romaneios antigos</h1>
      <p className="text-[13px] text-torg-gray mt-0.5 mb-5">
        Traz pro portal os romaneios que estão na pasta da OP (<b>4. Expedição › 4.2 Romaneios</b>), das obras expedidas antes do fluxo novo.
        As peças embarcadas passam a constar como <b>expedidas</b> e saem das filas de produção.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
        <p className="text-[12px] text-amber-800 inline-flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span><b>Só para obra antiga.</b> Nas novas o romaneio nasce no portal (Expedição) — importar a pasta em cima disso contaria o embarque duas vezes. O portal recusa sozinho se a OP já tiver romaneio emitido pelo fluxo novo.</span>
        </p>
      </div>

      <div className="flex items-end gap-2 mb-5">
        <div>
          <label className="block text-[11px] uppercase font-semibold text-torg-gray mb-1">Nº da OP</label>
          <input value={opNumero} onChange={(e) => setOpNumero(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ver()}
            placeholder="060" className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-[14px] font-mono" />
        </div>
        <button onClick={ver} disabled={carregando || !opNumero.trim()}
          className="text-[13px] font-semibold text-white bg-torg-blue hover:bg-torg-blue/90 rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-40">
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Ver o que a pasta tem
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}

      {previa && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h2 className="font-bold text-torg-dark">OP-{previa.op.numero} · {previa.op.obra || "—"}</h2>
          <p className="text-[11px] text-torg-gray font-mono mb-3 break-all">{previa.pasta || "pasta não encontrada"}</p>

          {!previa.arquivos ? (
            <p className="text-sm text-torg-gray">Nenhuma planilha de romaneio nessa pasta.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <Kpi rot="Romaneios lidos" val={`${fmtN(previa.lidos)}/${fmtN(previa.arquivos)}`} />
                <Kpi rot="Marcas" val={fmtN(previa.marcas)} />
                <Kpi rot="Peso" val={`${fmtN(previa.pesoKg)} kg`} />
                <Kpi rot="Casaram com o portal" val={`${fmtN(previa.casadas)}`} bom={previa.casadas === previa.marcas} />
              </div>

              {previa.semTabela?.length > 0 && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  <AlertTriangle size={13} className="inline -mt-0.5" /> <b>{previa.semTabela.length} arquivo(s) não abriram</b> (layout antigo, sem a tabela do FORM 22): {previa.semTabela.slice(0, 4).join(", ")}{previa.semTabela.length > 4 ? "…" : ""}. Esses embarques ficam de fora.
                </p>
              )}
              {previa.semCasar?.length > 0 && (
                <p className="text-[12px] text-torg-gray bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2">
                  <b>{previa.semCasar.length} marca(s) do romaneio não existem no portal</b> — a LPC importada não cobre essas peças: {previa.semCasar.slice(0, 8).join(", ")}{previa.semCasar.length > 8 ? "…" : ""}
                </p>
              )}

              <div className="overflow-x-auto mt-3">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase text-torg-gray border-b border-gray-100">
                      <th className="text-left py-1.5">Romaneio</th><th className="text-left py-1.5">Saída</th>
                      <th className="text-right py-1.5">Itens</th><th className="text-right py-1.5">Peso</th>
                      <th className="text-left py-1.5">Arquivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previa.romaneios.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 font-mono font-semibold whitespace-nowrap">{r.numero}</td>
                        <td className={`py-1.5 whitespace-nowrap tabular-nums ${r.dataSaida ? "" : "text-amber-700"}`}>{fmtD(r.dataSaida)}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtN(r.itens)}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.pesoKg != null ? `${fmtN(r.pesoKg)} kg` : "—"}</td>
                        <td className="py-1.5 text-torg-gray truncate max-w-[280px]" title={r.arquivo}><FileSpreadsheet size={11} className="inline -mt-0.5 text-emerald-600" /> {r.arquivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!resultado && (
                <button onClick={importar} disabled={gravando || !previa.lidos}
                  className="mt-4 text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-40">
                  {gravando ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} Importar e marcar {fmtN(previa.casadas)} peça(s) como expedidas
                </button>
              )}
            </>
          )}
        </div>
      )}

      {resultado?.gravado && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-[13px] font-bold text-emerald-800 inline-flex items-center gap-1.5"><CheckCircle2 size={15} /> Importado</p>
          <p className="text-[12px] text-emerald-900 mt-1">
            {fmtN(resultado.gravado.romaneiosCriados)} romaneio(s) criado(s){resultado.gravado.romaneiosAtualizados ? ` · ${fmtN(resultado.gravado.romaneiosAtualizados)} atualizado(s)` : ""} ·
            {" "}{fmtN(resultado.gravado.itens)} itens · <b>{fmtN(resultado.gravado.pecasExpedidas)} peça(s) marcadas como expedidas</b>.
          </p>
          <p className="text-[11px] text-emerald-800 mt-1">Elas saem das filas de produção e da TV de prioridades. Reabra o painel do PCP pra ver.</p>
        </div>
      )}
    </div>
  );
}

function Kpi({ rot, val, bom }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${bom ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-100"}`}>
      <p className="text-[10px] uppercase text-torg-gray">{rot}</p>
      <p className="text-lg font-extrabold text-torg-dark tabular-nums">{val}</p>
    </div>
  );
}
