"use client";
// ─── SIMULADOR PELA OBRA ─────────────────────────────────────────────────────
//
// Matheus (26/09/2026): *"o simulador pode trazer a porcentagem dos impostos quando eu seleciono a
// obra — o comercial já cadastra o imposto estimado do cliente"*. Escolher a obra lista as linhas de
// receita dela; escolher uma linha preenche NCM, CFOP e valor, e o resultado põe o % do Comercial ao
// lado da regra do portal. Ver lib/fiscal/impostos-da-obra.js.
//
// ⚠ A tela não corrige cadastro nenhum: onde os dois divergem, a linha fica âmbar com os dois números.
import { useEffect, useState } from "react";
import { Building2, Loader2, AlertTriangle } from "lucide-react";

const campo = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-torg-dark outline-none transition focus:border-torg-blue focus:ring-2 focus:ring-torg-blue/20";
const rotulo = "text-xs font-medium text-torg-gray";
const pct = (v) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const numero = (s) => Number(String(s ?? "").replace(/\./g, "").replace(",", "."));

export default function SimuladorObra({ ops }) {
  const [opId, setOpId] = useState("");
  const [receitas, setReceitas] = useState(null);
  const [receitaId, setReceitaId] = useState("");
  const [f, setF] = useState({ ncm: "", cfop: "", valor: "" });
  const [r, setR] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    setReceitas(null); setReceitaId(""); setR(null); setErro(null);
    if (!opId) return;
    let vivo = true;
    fetch(`/api/fiscal/inteligencia/simular-obra?opId=${encodeURIComponent(opId)}`).then((x) => x.json())
      .then((d) => { if (vivo) { if (d.success) setReceitas(d.receitas); else setErro(d.error); } })
      .catch(() => { if (vivo) setErro("Não foi possível carregar as receitas da obra."); });
    return () => { vivo = false; };
  }, [opId]);

  const escolherReceita = (rec) => {
    setReceitaId(rec.id); setR(null); setErro(null);
    setF({ ncm: rec.ncm ?? "", cfop: rec.cfop ?? "", valor: rec.valor ? String(rec.valor).replace(".", ",") : "" });
  };

  const simular = async () => {
    if (f.cfop.replace(/\D/g, "").length !== 4) { setErro("Escolha o CFOP — a linha da obra não tem."); return; }
    if (f.ncm.replace(/\D/g, "").length !== 8) { setErro("Informe o NCM com 8 dígitos."); return; }
    if (!(numero(f.valor) > 0)) { setErro("Informe o valor."); return; }
    setCarregando(true); setErro(null);
    try {
      const resp = await fetch("/api/fiscal/inteligencia/simular-obra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, receitaId: receitaId || null, ncm: f.ncm, cfop: f.cfop, valor: numero(f.valor) }),
      });
      const d = await resp.json().catch(() => null);
      if (!d?.success) { setErro(d?.error ?? `Falha ao simular (HTTP ${resp.status}).`); setR(null); } else setR(d);
    } catch { setErro("Falha de rede."); } finally { setCarregando(false); }
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-torg-dark"><Building2 size={16} className="text-torg-blue" /> Pela obra</h2>
      <div>
        <label className={rotulo} htmlFor="so-obra">Obra</label>
        <select id="so-obra" className={campo} value={opId} onChange={(e) => setOpId(e.target.value)}>
          <option value="">— escolha a obra —</option>
          {(ops ?? []).map((o) => <option key={o.id} value={o.id}>OP {o.numero} · {o.cliente}{o.clienteUF ? ` (${o.clienteUF})` : ""}</option>)}
        </select>
      </div>

      {opId && receitas && receitas.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Sem imposto cadastrado pelo Comercial nesta obra — a simulação sai só pela regra.</p>
      )}
      {receitas && receitas.length > 0 && (
        <fieldset className="space-y-1">
          <legend className={rotulo}>Linha de receita cadastrada pelo Comercial</legend>
          {receitas.map((rec) => (
            <label key={rec.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${receitaId === rec.id ? "border-torg-blue bg-torg-blue/5" : "border-gray-100"}`}>
              <input type="radio" name="so-receita" checked={receitaId === rec.id} onChange={() => escolherReceita(rec)} className="mt-0.5" />
              <span className="flex-1">
                <span className="text-torg-dark">{rec.descricao}</span>
                <span className="block text-torg-gray">CFOP {rec.cfop ?? "—"} · ICMS {pct(rec.pct.icms)} · IPI {pct(rec.pct.ipi)} · PIS {pct(rec.pct.pis)} · COFINS {pct(rec.pct.cofins)} · {brl(rec.valor)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {opId && (
        <div className="grid gap-3 md:grid-cols-4">
          <div><label className={rotulo} htmlFor="so-ncm">NCM</label><input id="so-ncm" className={campo} value={f.ncm} onChange={(e) => setF({ ...f, ncm: e.target.value })} /></div>
          <div><label className={rotulo} htmlFor="so-cfop">CFOP</label><input id="so-cfop" className={campo} placeholder="ex.: 6101" value={f.cfop} onChange={(e) => setF({ ...f, cfop: e.target.value })} /></div>
          <div><label className={rotulo} htmlFor="so-valor">Valor (R$)</label><input id="so-valor" className={campo} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
          <div className="flex items-end">
            <button type="button" onClick={simular} disabled={carregando}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-torg-blue px-3 py-2 text-sm font-medium text-white hover:bg-torg-blue/90 disabled:opacity-60">
              {carregando && <Loader2 size={14} className="animate-spin" />} Simular
            </button>
          </div>
        </div>
      )}

      {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
      {r && <ResultadoObra r={r} />}
    </div>
  );
}

function ResultadoObra({ r }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50/60 text-torg-gray">
          <tr><th className="px-3 py-2 text-left">Tributo</th><th className="px-3 py-2 text-right">Cadastrado (Comercial)</th>
            <th className="px-3 py-2 text-right">Regra</th><th className="px-3 py-2 text-right">Valor</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {r.linhas.map((l) => (
            <tr key={l.tributo} className={l.divergente ? "bg-amber-50" : undefined}>
              <td className="px-3 py-2 font-medium text-torg-dark">
                {l.tributo}
                {l.divergente && <AlertTriangle size={12} className="ml-1 inline text-amber-600" aria-label="diverge" />}
                {l.nota && <span className="block font-normal text-torg-gray">{l.nota}</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(l.cadastrado)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(l.regra)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{brl(l.valor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-semibold text-torg-dark"><td className="px-3 py-2" colSpan={3}>Total estimado</td>
          <td className="px-3 py-2 text-right tabular-nums">{brl(r.total)}</td></tr></tfoot>
      </table>
      <p className="mt-2 text-[11px] text-torg-gray">OP {r.obra.numero} · {r.obra.cliente}{r.obra.uf ? `/${r.obra.uf}` : ""} · NCM {r.ncm} · CFOP {r.cfop}. Estimativa sobre o valor informado — não substitui a apuração.</p>
    </div>
  );
}
