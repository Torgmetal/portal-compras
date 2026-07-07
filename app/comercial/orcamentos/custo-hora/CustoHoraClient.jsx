"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Calculator, Loader2, AlertCircle, RefreshCw, Save, Plus, Trash2, Info, Upload } from "lucide-react";
import { useStore } from "@/lib/store";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmtBRL = (v) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBRL0 = (v) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

// Sugestão de custos operacionais NÃO-folha, tirada da DRE Alvo 2026 (sem folha,
// sem matéria-prima, sem hospedagem, sem capex/financeiro). Valores R$/mês.
const SEED_OUTROS_DRE = [
  { nome: "Material auxiliar", valor: 30000 },
  { nome: "Gás (equipamento)", valor: 25000 },
  { nome: "Energia elétrica — fábrica", valor: 35000 },
  { nome: "Ferramentas", valor: 5000 },
  { nome: "Aluguel equipamento produção + empilhadeira", valor: 14000 },
  { nome: "Aluguéis (imóvel, veículos, equip. montagem/TI)", valor: 44800 },
  { nome: "Manutenções (equip., software, imóvel, rede, veículos)", valor: 55740 },
  { nome: "Prestadores (consultoria, advogado, contabilidade, seg. trabalho)", valor: 43000 },
  { nome: "Utilidades (energia escritório, água, telefone, combustível)", valor: 15200 },
  { nome: "Materiais (escritório, limpeza, EPI)", valor: 12500 },
  { nome: "Seguros (incêndio, predial, engenharia)", valor: 4800 },
  { nome: "Marketing", valor: 2250 },
  { nome: "Impostos/taxas (IPVA, IPTU, contribuição, despachante)", valor: 3500 },
  { nome: "Bancárias + pedágio", valor: 1700 },
  { nome: "Refeições (ADM)", valor: 4000 },
  { nome: "Outros — acertos de funcionários", valor: 10000 },
];

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
  const [ocupacao, setOcupacao] = useState(8);
  const [setores, setSetores] = useState([]);
  const [outrosCustos, setOutrosCustos] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const arqRef = useRef(null);

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
      setHorasDia(c.horasDia ?? 8.75); setDiasUteis(c.diasUteis ?? 22); setOcupacao(c.ocupacaoPct ?? 8);
      setSetores((Array.isArray(c.setores) ? c.setores : []).map((s) => ({ id: s.id || uid(), nome: s.nome || "", empresa: s.empresa || "", faturaHora: s.faturaHora !== false, salarios: s.salarios ?? 0, mod: s.mod ?? 0, headcount: s.headcount ?? 0, horasMes: s.horasMes ?? 0, cifDireto: s.cifDireto ?? 0 })));
      setOutrosCustos((Array.isArray(c.outrosCustos) ? c.outrosCustos : []).map((x) => ({ id: x.id || uid(), nome: x.nome || "", valor: x.valor ?? 0 })));
      setDirty(false);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const setSetor = (i, campo, valor) => { setSetores((p) => p.map((s, idx) => (idx === i ? { ...s, [campo]: valor } : s))); marcar(); };
  const addSetor = () => { setSetores((p) => [...p, { id: uid(), nome: "", empresa: "", faturaHora: true, salarios: 0, mod: 0, headcount: 0, horasMes: 0, cifDireto: 0 }]); marcar(); };
  const rmSetor = (i) => { setSetores((p) => p.filter((_, idx) => idx !== i)); marcar(); };

  const importarCet = async (file) => {
    if (!file) return;
    setImportando(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/comercial/custo-hora/importar", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar");
      setSetores((d.setores || []).map((s) => ({ id: uid(), nome: s.nome || "", empresa: s.empresa || "", faturaHora: s.faturaHora !== false, salarios: s.salarios ?? 0, mod: s.mod ?? 0, headcount: s.headcount ?? 0, horasMes: s.horasMes ?? 0, cifDireto: 0 })));
      marcar();
      showToast(`${(d.setores || []).length} setores importados · CET total ${fmtBRL0(d.cetTotal)}`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setImportando(false); }
  };

  const addOutro = () => { setOutrosCustos((p) => [...p, { id: uid(), nome: "", valor: 0 }]); marcar(); };
  const setOutro = (i, campo, valor) => { setOutrosCustos((p) => p.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c))); marcar(); };
  const rmOutro = (i) => { setOutrosCustos((p) => p.filter((_, idx) => idx !== i)); marcar(); };
  const sugerirOutros = () => { setOutrosCustos(SEED_OUTROS_DRE.map((c) => ({ id: uid(), nome: c.nome, valor: c.valor }))); marcar(); showToast("Custos da DRE preenchidos — revise e Salve", "success"); };

  const salvar = async () => {
    setSalvando(true);
    try {
      const payload = {
        fatorEncargos: num(fator) || 1,
        custoTotalMensal: Math.round(custoTotalCalc),
        criterioRateio: criterio,
        margemPct: num(margem),
        impostosVendaPct: num(impostosVenda),
        horasDia: num(horasDia) || 8.75,
        diasUteis: num(diasUteis) || 22,
        ocupacaoPct: num(ocupacao) || 80,
        setores: setores.map((s) => ({ id: s.id, nome: s.nome, empresa: s.empresa || "", faturaHora: s.faturaHora !== false, salarios: num(s.salarios), mod: num(s.mod), headcount: num(s.headcount), horasMes: num(s.horasMes), cifDireto: num(s.cifDireto) })),
        outrosCustos: outrosCustos.map((c) => ({ id: c.id, nome: c.nome, valor: num(c.valor) })),
      };
      const r = await fetch("/api/comercial/custo-hora", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      setDirty(false); showToast("Custo-hora salvo", "success");
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  };

  // ─── Cálculo ao vivo ───
  const f = num(fator);
  const horasPorPessoa = num(horasDia) * num(diasUteis) * (1 - num(ocupacao) / 100);
  const fatura = (s) => s.faturaHora !== false; // fábrica/externa faturam hora; ADM/apoio = overhead (rateado)
  const horasMes = (s) => (num(s.horasMes) > 0 ? num(s.horasMes) : num(s.headcount) * horasPorPessoa);
  const mod = (s) => (num(s.mod) > 0 ? num(s.mod) : num(s.salarios) * f); // CET real (importado) ou salários × fator
  const modTotal = setores.reduce((a, s) => a + mod(s), 0);
  const cifTotal = setores.reduce((a, s) => a + num(s.cifDireto), 0);
  // Overhead a ratear = folha dos setores que NÃO faturam (ADM) + custos
  // operacionais não-folha (outrosCustos, da DRE). Tudo isso é diluído nos
  // setores que vendem hora.
  const overheadFolha = setores.reduce((a, s) => a + (fatura(s) ? 0 : mod(s) + num(s.cifDireto)), 0);
  const outrosTotal = outrosCustos.reduce((a, c) => a + num(c.valor), 0);
  const overheadTotal = overheadFolha + outrosTotal;
  // Pesos do rateio: só entre os setores que faturam.
  const modBill = setores.reduce((a, s) => a + (fatura(s) ? mod(s) : 0), 0);
  const hcBill = setores.reduce((a, s) => a + (fatura(s) ? num(s.headcount) : 0), 0);
  const horasBill = setores.reduce((a, s) => a + (fatura(s) ? horasMes(s) : 0), 0);
  const peso = (s) => {
    if (!fatura(s)) return 0;
    if (criterio === "HEADCOUNT") return hcBill ? num(s.headcount) / hcBill : 0;
    if (criterio === "HORAS") return horasBill ? horasMes(s) / horasBill : 0;
    return modBill ? mod(s) / modBill : 0;
  };
  const overheadAloc = (s) => (fatura(s) ? overheadTotal * peso(s) : 0);
  const custoMes = (s) => mod(s) + num(s.cifDireto) + overheadAloc(s);
  const custoHora = (s) => (fatura(s) && horasMes(s) > 0 ? custoMes(s) / horasMes(s) : 0);
  const imp = Math.min(89, num(impostosVenda)) / 100;
  const precoHora = (s) => (fatura(s) ? (custoHora(s) * (1 + num(margem) / 100)) / (1 - imp) : 0);
  const custoAlocadoTotal = setores.reduce((a, s) => a + (fatura(s) ? custoMes(s) : 0), 0);
  const custoTotalCalc = modTotal + cifTotal + outrosTotal; // custo mensal total a recuperar nas horas faturáveis

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
          <button onClick={() => arqRef.current?.click()} disabled={importando} className="px-3 py-2 border border-torg-blue/30 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-2 disabled:opacity-50" title="Importar a planilha de auditoria (CET) — traz salário, CET real, horas e pessoas por setor">
            {importando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Importar auditoria
          </button>
          <input ref={arqRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { importarCet(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      </div>

      {/* Parâmetros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-torg-gray">Fator de encargos</label>
            <input type="number" step="0.01" value={fator} onChange={(e) => { setFator(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
            <p className="text-[10px] text-torg-gray mt-1">Lucro Real ≈ 1,7–1,8</p>
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
            <label className="text-xs text-torg-gray">Absenteísmo (%)</label>
            <input type="number" step="0.5" value={ocupacao} onChange={(e) => { setOcupacao(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
            <p className="text-[10px] text-torg-gray mt-1">faltas médias</p>
          </div>
        </div>
        <p className="text-[11px] text-torg-gray mt-1">Horas/mês são <strong>lançadas manualmente</strong> por setor. Vazio usa a estimativa de <strong>{Math.round(horasPorPessoa)} h/pessoa</strong> (horas/dia × dias úteis × (1 − absenteísmo)) como sugestão.</p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
          <div><div className="text-[11px] text-torg-gray uppercase">MOD (folha, c/ enc.)</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL0(modTotal)}</div></div>
          <div><div className="text-[11px] text-torg-gray uppercase">Outros custos (DRE)</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL0(outrosTotal)}</div></div>
          <div><div className="text-[11px] text-torg-gray uppercase">Overhead a ratear</div><div className="font-semibold text-torg-blue tabular-nums">{fmtBRL0(overheadTotal)}</div><div className="text-[10px] text-torg-gray">ADM folha ({fmtBRL0(overheadFolha)}) + outros</div></div>
          <div><div className="text-[11px] text-torg-gray uppercase">Custo total/mês</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL0(custoTotalCalc)}</div></div>
          <div><div className="text-[11px] text-torg-gray uppercase">Alocado</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL0(custoAlocadoTotal)}</div></div>
        </div>
      </div>

      {/* Setores */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50/60">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-2">Setor</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-center">Fatura?</th>
                <th className="px-3 py-2 text-right">Salários (R$/mês)</th>
                <th className="px-3 py-2 text-right">Pessoas</th>
                <th className="px-3 py-2 text-right">Horas/mês</th>
                <th className="px-3 py-2 text-right">CIF (R$/mês)</th>
                <th className="px-3 py-2 text-right">MOD (CET)</th>
                <th className="px-3 py-2 text-right">Overhead</th>
                <th className="px-3 py-2 text-right">Custo/mês</th>
                <th className="px-3 py-2 text-right bg-torg-blue-50/50">Custo-hora</th>
                <th className="px-3 py-2 text-right bg-torg-blue-50/50">Preço-hora</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {setores.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-6 text-center text-torg-gray text-sm">Nenhum setor. Importe a auditoria (CET) ou adicione abaixo.</td></tr>
              ) : setores.map((s, i) => (
                <tr key={s.id} className={fatura(s) ? "" : "bg-gray-50/50 text-torg-gray"}>
                  <td className="px-3 py-1.5"><input value={s.nome} onChange={(e) => setSetor(i, "nome", e.target.value)} placeholder="Setor" className="w-36 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-xs text-torg-gray">{s.empresa || "—"}</td>
                  <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={fatura(s)} onChange={(e) => setSetor(i, "faturaHora", e.target.checked)} title="Marcado = setor que fatura hora (fábrica/externa). Desmarque para tratar como overhead (ADM/apoio), rateado nos que faturam." className="accent-torg-blue w-4 h-4 cursor-pointer" /></td>
                  <td className="px-3 py-1.5 text-right"><input type="number" step="100" value={s.salarios} onChange={(e) => setSetor(i, "salarios", e.target.value)} className="w-28 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-right"><input type="number" step="1" value={s.headcount} onChange={(e) => setSetor(i, "headcount", e.target.value)} className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-right"><input type="number" step="10" value={s.horasMes || ""} onChange={(e) => setSetor(i, "horasMes", e.target.value)} placeholder={String(Math.round(num(s.headcount) * horasPorPessoa))} title="Horas/mês lançadas manualmente. Vazio = estimativa por pessoas × jornada." className="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue placeholder:text-gray-300" /></td>
                  <td className="px-3 py-1.5 text-right"><input type="number" step="100" value={s.cifDireto} onChange={(e) => setSetor(i, "cifDireto", e.target.value)} className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray">{fmtBRL0(mod(s))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray">{fatura(s) ? fmtBRL0(overheadAloc(s)) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-torg-dark font-medium">{fatura(s) ? fmtBRL0(custoMes(s)) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-torg-dark bg-torg-blue-50/40">{fatura(s) ? fmtBRL(custoHora(s)) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-extrabold text-torg-blue bg-torg-blue-50/40">{fatura(s) ? fmtBRL(precoHora(s)) : "—"}</td>
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

      {/* Outros custos operacionais (overhead não-folha) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2"><Info size={16} className="text-torg-blue" /> Outros custos operacionais (overhead)</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-torg-gray">Total: <strong className="text-torg-dark tabular-nums">{fmtBRL0(outrosTotal)}/mês</strong></span>
            <button onClick={sugerirOutros} className="text-xs text-torg-blue border border-torg-blue/30 rounded-lg px-2.5 py-1.5 hover:bg-torg-blue-50 font-medium">Sugerir da DRE</button>
          </div>
        </div>
        <p className="text-xs text-torg-gray mb-3">Custos <strong>não-folha</strong> da estrutura (material auxiliar, energia, gás, aluguéis, manutenção…). Entram no overhead rateado nos setores que faturam. <strong>Sem folha, sem matéria-prima, sem capex</strong> (já tratados à parte).</p>
        {outrosCustos.length > 0 && (
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg mb-3">
            {outrosCustos.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                <input value={c.nome} onChange={(e) => setOutro(i, "nome", e.target.value)} placeholder="Descrição do custo" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue" />
                <input type="number" step="100" value={c.valor} onChange={(e) => setOutro(i, "valor", e.target.value)} className="w-32 border border-gray-200 rounded px-2 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" />
                <span className="text-[11px] text-torg-gray w-8">/mês</span>
                <button onClick={() => rmOutro(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <button onClick={addOutro} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-torg-gray hover:border-torg-blue hover:text-torg-blue text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors">
          <Plus size={15} /> Adicionar custo
        </button>
      </div>

      <div className="text-xs text-torg-gray space-y-1">
        <p><strong>Como calcula:</strong> MOD = <strong>CET real</strong> (importado) ou salários × fator. Só os setores marcados em <strong>"Fatura?"</strong> ganham custo/preço-hora. O <strong>overhead a ratear</strong> = folha dos setores que não faturam (ADM) + os <strong>outros custos operacionais</strong> acima — rateado nos que faturam pelo critério escolhido. Assim a hora vendida carrega a empresa inteira.</p>
        <p><strong>Importar auditoria:</strong> lê a aba "Custo Efetivo" e agrupa (Torg + VMI = uma empresa): setores de fábrica separados, <strong>Montagem externa</strong> à parte (não é fábrica) e todo o apoio em <strong>ADM</strong>. Traz CET real e nº de pessoas; as <strong>horas você lança na mão</strong>. Depois revise e <strong>Salve</strong>.</p>
        <p>Custo-hora = (MOD + CIF + overhead) ÷ horas do setor — já inclui folha, ADM e os outros custos operacionais. <strong>Preço-hora = custo-hora × (1 + margem de lucro) ÷ (1 − impostos de venda)</strong>: a margem é lucro puro e os impostos (ISS/PIS/COFINS) saem por cima da venda.</p>
        <p>Horas/mês do setor são <strong>manuais</strong> — digite na coluna Horas/mês. Se deixar vazio, entra a estimativa <strong>pessoas × horas/dia × dias úteis × (1 − absenteísmo)</strong> (ajuste a jornada e o absenteísmo acima).</p>
        <p><strong>CIF (R$/mês)</strong> é o custo indireto do setor por mês (energia/consumíveis/depreciação da máquina) — valor em reais, não %. Opcional: se deixar 0, entra no overhead rateado.</p>
      </div>
    </div>
  );
}
