"use client";
import { useState, useEffect, useCallback } from "react";
import { Calculator, Loader2, AlertCircle, RefreshCw, Save, Plus, Trash2, Info } from "lucide-react";
import { useStore } from "@/lib/store";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmtBRL = (v) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBRL0 = (v) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export default function CustoHoraClient() {
  const { showToast } = useStore();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [fator, setFator] = useState(1.8);
  const [custoTotal, setCustoTotal] = useState("");
  const [criterio, setCriterio] = useState("MOD");
  const [margem, setMargem] = useState(30);
  const [impostosVenda, setImpostosVenda] = useState(15);
  const [horasDia, setHorasDia] = useState(8.75);
  const [diasUteis, setDiasUteis] = useState(22);
  const [ocupacao, setOcupacao] = useState(80);
  const [setores, setSetores] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const marcar = () => setDirty(true);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/comercial/custo-hora");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      const c = d.config;
      setFator(c.fatorEncargos ?? 1.8);
      setCustoTotal(c.custoTotalMensal ?? "");
      setCriterio(c.criterioRateio || "MOD");
      setMargem(c.margemPct ?? 30);
      setImpostosVenda(c.impostosVendaPct ?? 15);
      setHorasDia(c.horasDia ?? 8.75); setDiasUteis(c.diasUteis ?? 22); setOcupacao(c.ocupacaoPct ?? 85);
      setSetores((Array.isArray(c.setores) ? c.setores : []).map((s) => ({ id: s.id || uid(), nome: s.nome || "", salarios: s.salarios ?? 0, headcount: s.headcount ?? 0, horasMes: s.horasMes ?? 0, cifDireto: s.cifDireto ?? 0 })));
      setDirty(false);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const setSetor = (i, campo, valor) => { setSetores((p) => p.map((s, idx) => (idx === i ? { ...s, [campo]: valor } : s))); marcar(); };
  const addSetor = () => { setSetores((p) => [...p, { id: uid(), nome: "", salarios: 0, headcount: 0, horasMes: 0, cifDireto: 0 }]); marcar(); };
  const rmSetor = (i) => { setSetores((p) => p.filter((_, idx) => idx !== i)); marcar(); };

  const salvar = async () => {
    setSalvando(true);
    try {
      const payload = {
        fatorEncargos: num(fator) || 1,
        custoTotalMensal: custoTotal === "" || custoTotal === null ? null : num(custoTotal),
        criterioRateio: criterio,
        margemPct: num(margem),
        impostosVendaPct: num(impostosVenda),
        horasDia: num(horasDia) || 8.75,
        diasUteis: num(diasUteis) || 22,
        ocupacaoPct: num(ocupacao) || 80,
        setores: setores.map((s) => ({ id: s.id, nome: s.nome, salarios: num(s.salarios), headcount: num(s.headcount), horasMes: Math.round(num(s.headcount) * (num(horasDia) * num(diasUteis) * (num(ocupacao) / 100))), cifDireto: num(s.cifDireto) })),
      };
      const r = await fetch("/api/comercial/custo-hora", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      setDirty(false); showToast("Custo-hora salvo", "success");
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  };

  // ─── Cálculo ao vivo ───
  const f = num(fator);
  const horasPorPessoa = num(horasDia) * num(diasUteis) * (num(ocupacao) / 100);
  const horasMes = (s) => num(s.headcount) * horasPorPessoa;
  const mod = (s) => num(s.salarios) * f;
  const modTotal = setores.reduce((a, s) => a + mod(s), 0);
  const cifTotal = setores.reduce((a, s) => a + num(s.cifDireto), 0);
  const diretoTotal = modTotal + cifTotal;
  const overheadTotal = Math.max(0, num(custoTotal) - diretoTotal);
  const hcTotal = setores.reduce((a, s) => a + num(s.headcount), 0);
  const horasTotal = setores.reduce((a, s) => a + horasMes(s), 0);
  const peso = (s) => {
    if (criterio === "HEADCOUNT") return hcTotal ? num(s.headcount) / hcTotal : 0;
    if (criterio === "HORAS") return horasTotal ? horasMes(s) / horasTotal : 0;
    return modTotal ? mod(s) / modTotal : 0;
  };
  const overheadAloc = (s) => overheadTotal * peso(s);
  const custoMes = (s) => mod(s) + num(s.cifDireto) + overheadAloc(s);
  const custoHora = (s) => (horasMes(s) > 0 ? custoMes(s) / horasMes(s) : 0);
  const imp = Math.min(89, num(impostosVenda)) / 100;
  const precoHora = (s) => (custoHora(s) * (1 + num(margem) / 100)) / (1 - imp);
  const custoAlocadoTotal = setores.reduce((a, s) => a + custoMes(s), 0);
  const faltaAlocar = num(custoTotal) - custoAlocadoTotal;

  if (carregando) return <div className="py-20 text-center text-torg-gray"><Loader2 size={30} className="mx-auto animate-spin mb-2" /> Carregando...</div>;
  if (erro) return (
    <div className="py-20 text-center">
      <AlertCircle size={30} className="mx-auto text-red-400 mb-2" /><p className="text-sm text-red-600 mb-3">{erro}</p>
      <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
    </div>
  );

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><Calculator className="text-torg-blue" /> Custo-hora por setor</h2>
          <p className="text-sm text-torg-gray mt-1">Base do "valor por hora" das propostas de serviço. Lucro Real.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">não salvo</span>}
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      </div>

      {/* Parâmetros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div>
            <label className="text-xs text-torg-gray">Fator de encargos</label>
            <input type="number" step="0.01" value={fator} onChange={(e) => { setFator(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
            <p className="text-[10px] text-torg-gray mt-1">Lucro Real ≈ 1,7–1,8</p>
          </div>
          <div>
            <label className="text-xs text-torg-gray">Custo total mensal (R$)</label>
            <input type="number" step="1000" value={custoTotal} onChange={(e) => { setCustoTotal(e.target.value); marcar(); }} placeholder="1500000" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
            <p className="text-[10px] text-torg-gray mt-1">Toda a estrutura</p>
          </div>
          <div>
            <label className="text-xs text-torg-gray">Ratear ADM/overhead por</label>
            <select value={criterio} onChange={(e) => { setCriterio(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue">
              <option value="MOD">Mão de obra (MOD)</option>
              <option value="HEADCOUNT">Headcount</option>
              <option value="HORAS">Horas produtivas</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-torg-gray">Margem de lucro (%)</label>
            <input type="number" step="1" value={margem} onChange={(e) => { setMargem(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
          </div>
          <div>
            <label className="text-xs text-torg-gray">Impostos venda (%)</label>
            <input type="number" step="0.1" value={impostosVenda} onChange={(e) => { setImpostosVenda(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
            <p className="text-[10px] text-torg-gray mt-1">ISS + PIS/COFINS</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div>
            <label className="text-xs text-torg-gray">Horas por dia</label>
            <input type="number" step="0.1" value={horasDia} onChange={(e) => { setHorasDia(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
          </div>
          <div>
            <label className="text-xs text-torg-gray">Dias úteis/mês</label>
            <input type="number" step="1" value={diasUteis} onChange={(e) => { setDiasUteis(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
          </div>
          <div>
            <label className="text-xs text-torg-gray">Aproveitamento (%)</label>
            <input type="number" step="1" value={ocupacao} onChange={(e) => { setOcupacao(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
            <p className="text-[10px] text-torg-gray mt-1">presença (absenteísmo) + paradas</p>
          </div>
        </div>
        <p className="text-[11px] text-torg-gray mt-1">Horas/mês por pessoa = horas/dia × dias úteis × ocupação = <strong>{Math.round(horasPorPessoa)} h</strong>. As horas/mês de cada setor saem de <strong>pessoas × esse valor</strong>.</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
          <div><div className="text-[11px] text-torg-gray uppercase">MOD (c/ encargos)</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL0(modTotal)}</div></div>
          <div><div className="text-[11px] text-torg-gray uppercase">CIF direto</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL0(cifTotal)}</div></div>
          <div><div className="text-[11px] text-torg-gray uppercase">Overhead / ADM a ratear</div><div className="font-semibold text-torg-blue tabular-nums">{fmtBRL0(overheadTotal)}</div><div className="text-[10px] text-torg-gray">resíduo (total − diretos)</div></div>
          <div><div className="text-[11px] text-torg-gray uppercase">Alocado</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL0(custoAlocadoTotal)}</div></div>
        </div>
        {num(custoTotal) > 0 && diretoTotal > num(custoTotal) && (
          <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" /> Os custos diretos ({fmtBRL0(diretoTotal)}) já passam do total mensal ({fmtBRL0(num(custoTotal))}). Reveja os salários/encargos ou o custo total — o overhead ficou zero.
          </div>
        )}
      </div>

      {/* Setores */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50/60">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-2">Setor</th>
                <th className="px-3 py-2 text-right">Salários (R$/mês)</th>
                <th className="px-3 py-2 text-right">Pessoas</th>
                <th className="px-3 py-2 text-right">Horas/mês</th>
                <th className="px-3 py-2 text-right">CIF (R$/mês)</th>
                <th className="px-3 py-2 text-right">MOD</th>
                <th className="px-3 py-2 text-right">Overhead</th>
                <th className="px-3 py-2 text-right">Custo/mês</th>
                <th className="px-3 py-2 text-right bg-torg-blue-50/50">Custo-hora</th>
                <th className="px-3 py-2 text-right bg-torg-blue-50/50">Preço-hora</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {setores.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-torg-gray text-sm">Nenhum setor. Adicione abaixo.</td></tr>
              ) : setores.map((s, i) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5"><input value={s.nome} onChange={(e) => setSetor(i, "nome", e.target.value)} placeholder="Setor" className="w-32 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-right"><input type="number" step="100" value={s.salarios} onChange={(e) => setSetor(i, "salarios", e.target.value)} className="w-28 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-right"><input type="number" step="1" value={s.headcount} onChange={(e) => setSetor(i, "headcount", e.target.value)} className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray">{Math.round(horasMes(s)).toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right"><input type="number" step="100" value={s.cifDireto} onChange={(e) => setSetor(i, "cifDireto", e.target.value)} className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray">{fmtBRL0(mod(s))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray">{fmtBRL0(overheadAloc(s))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-torg-dark font-medium">{fmtBRL0(custoMes(s))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-torg-dark bg-torg-blue-50/40">{fmtBRL(custoHora(s))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-extrabold text-torg-blue bg-torg-blue-50/40">{fmtBRL(precoHora(s))}</td>
                  <td className="px-3 py-1.5 text-center"><button onClick={() => rmSetor(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button onClick={addSetor} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-torg-gray hover:border-torg-blue hover:text-torg-blue font-medium inline-flex items-center justify-center gap-2 transition-colors">
        <Plus size={16} /> Adicionar setor
      </button>

      <div className="text-xs text-torg-gray space-y-1">
        <p><strong>Como calcula:</strong> MOD = salários × fator de encargos. Overhead/ADM = custo total − custos diretos (resíduo), rateado pelo critério escolhido.</p>
        <p>Custo-hora = (MOD + CIF + overhead) ÷ horas do setor — já inclui tudo do custo total mensal (salários, encargos, ADM). <strong>Preço-hora = custo-hora × (1 + margem de lucro) ÷ (1 − impostos de venda)</strong>: a margem é lucro puro e os impostos (ISS/PIS/COFINS) saem por cima da venda.</p>
        <p>Horas/mês do setor = <strong>pessoas × (horas/dia × dias úteis × ocupação)</strong> — automático. Ajuste a jornada nos campos acima; ocupação 60–85% (nunca 100%).</p>
        <p><strong>CIF (R$/mês)</strong> é o custo indireto do setor por mês (energia/consumíveis/depreciação da máquina) — valor em reais, não %. Opcional: se deixar 0, entra no overhead rateado.</p>
      </div>
    </div>
  );
}
