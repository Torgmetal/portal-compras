"use client";
// Veículos e índice de frete do simulador de carga. As medidas são PREMISSAS a confirmar com a
// Expedição (carreta e truck verificados; toco, 3/4 e HR "típicos") — por isso são editáveis aqui e
// não no código. Frete é um índice relativo (carreta = 100): só ordena e compara; o simulador escolhe
// o menor veículo em que a carga cabe inteira. Cabeceira: altura do painel da frente — o travamento
// (lib/carga/travamento.js) só conta como encostado nela o volume na altura que ela cobre.
import { useEffect, useState } from "react";
import { Truck, Loader2, Save, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";

const CAMPOS = [["nome", "Veículo", "text", 220], ["C", "Compr. (mm)", "number", 84], ["L", "Larg. (mm)", "number", 78], ["alturaUtil", "Alt. útil (mm)", "number", 84], ["pesoMax", "Carga (kg)", "number", 84], ["assoalho", "Assoalho (mm)", "number", 84], ["cabeceira", "Cabeceira (mm)", "number", 84], ["frete", "Frete (índice)", "number", 84]];

export default function ConfigCargaSection() {
  const [linhas, setLinhas] = useState(null), [erro, setErro] = useState(""), [ok, setOk] = useState(""), [salvando, setSalvando] = useState(false), [quando, setQuando] = useState(null);
  useEffect(() => { fetch("/api/planejamento/expedicao/config-carga").then((r) => r.json()).then((j) => { setLinhas(j.veiculos || []); setQuando(j.atualizadoEm); }).catch(() => setLinhas([])); }, []);
  const mudar = (i, k, v) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const salvar = async () => {
    setSalvando(true); setErro(""); setOk("");
    try {
      const veiculos = linhas.map((l) => ({ chave: l.chave, nome: String(l.nome || "").trim(), C: Number(l.C), L: Number(l.L), alturaUtil: Number(l.alturaUtil), pesoMax: Number(l.pesoMax), assoalho: Number(l.assoalho), cabeceira: Number(l.cabeceira) || 0, frete: Number(l.frete), ativo: !!l.ativo }));
      const r = await fetch("/api/planejamento/expedicao/config-carga", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ veiculos }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setLinhas(j.veiculos); setQuando(j.atualizadoEm); setOk("Salvo. Vale para as próximas simulações de carga.");
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  };
  const restaurar = (i) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...l.padrao, ativo: true } : l)));
  const inp = "w-full text-[12px] border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50 disabled:text-gray-400";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="text-xl font-extrabold text-torg-dark flex items-center gap-2"><Truck size={20} className="text-torg-blue" /> Veículos do simulador de carga</h2>
        <p className="text-[13px] text-torg-gray mt-1.5 leading-relaxed">
          Medidas da carroceria e capacidade de cada veículo que a Expedição contrata. O <span className="font-semibold text-torg-dark">Simular carga</span> do romaneio prévio
          monta a carga na carreta e depois tenta o menor veículo em que ela cabe inteira. O <span className="font-semibold text-torg-dark">frete</span> é um índice relativo
          (carreta = 100) só para comparar — troque pela tabela real quando tiver. Desmarque um veículo para tirá-lo das simulações; a carreta (base do cálculo) e a de 14 m (peças longas) não saem.
          A <span className="font-semibold text-torg-dark">cabeceira</span> é a altura do painel da frente acima do assoalho: até ali ele segura a carga numa frenagem, e o volume acima dela,
          sem nada à frente, sai como “amarrar” (Resolução CONTRAN 945/2022, art. 8º). Em branco, só a camada do assoalho conta como encostada nela.
        </p>
      </div>
      <div className="px-6 py-4 overflow-x-auto">
        {linhas === null ? <div className="py-8 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div> : (
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50/60 text-torg-gray"><tr><th className="px-2 py-1.5 text-left font-medium w-10">Usa</th>{CAMPOS.map(([k, l]) => <th key={k} className="px-2 py-1.5 text-left font-medium">{l}</th>)}<th className="px-2 py-1.5 w-8"></th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map((l, i) => (
                <tr key={l.chave} className={l.ativo ? "" : "opacity-60"}>
                  <td className="px-2 py-1.5"><input type="checkbox" checked={!!l.ativo} disabled={l.chave === "carreta" || l.chave === "carreta14"} onChange={(e) => mudar(i, "ativo", e.target.checked)} className="accent-torg-blue" /></td>
                  {CAMPOS.map(([k, , tipo, w]) => <td key={k} className="px-2 py-1.5" style={{ minWidth: w }}><input type={tipo} value={l[k] ?? ""} onChange={(e) => mudar(i, k, e.target.value)} className={`${inp} ${tipo === "number" ? "text-right tabular-nums" : ""}`} /></td>)}
                  <td className="px-2 py-1.5"><button onClick={() => restaurar(i)} title="Voltar ao padrão" className="text-gray-300 hover:text-torg-blue"><RotateCcw size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button onClick={salvar} disabled={salvando || !linhas} className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar veículos</button>
          {quando && <span className="text-[11px] text-torg-gray">última alteração {new Date(quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
          {erro && <span className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</span>}
          {ok && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={13} /> {ok}</span>}
        </div>
      </div>
    </div>
  );
}
