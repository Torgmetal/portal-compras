"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Upload, Loader2, ArrowLeft, CheckCircle2, AlertCircle, GitCompareArrows,
  UserPlus, Filter, Save,
} from "lucide-react";
import { useStore } from "@/lib/store";

const LABEL = {
  nome: "Nome", cpf: "CPF", email: "E-mail", empresa: "Empresa",
  centroCusto: "Centro de Custo", dataNascimento: "Nascimento",
};
const CONF_COR = { alta: "bg-green-100 text-green-700", média: "bg-amber-100 text-amber-700", baixa: "bg-red-100 text-red-700" };

export default function ReconciliarClient() {
  const { showToast } = useStore();
  const [arquivos, setArquivos] = useState([]);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [marcados, setMarcados] = useState({}); // { funcionarioId: { campo: true } }
  const [soDivergencia, setSoDivergencia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const analisar = async () => {
    if (arquivos.length === 0) { showToast("Selecione a(s) planilha(s)", "error"); return; }
    setAnalisando(true); setErro(""); setResultado(null);
    try {
      const fd = new FormData();
      arquivos.forEach((a) => fd.append("file", a));
      const r = await fetch("/api/rh/funcionarios/reconciliar/preparar", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao analisar");
      setResultado(d);
      // Default: marca "preencher", deixa "corrigir" desmarcado
      const init = {};
      for (const it of d.itens) {
        for (const c of it.campos) {
          if (c.acao === "preencher") { (init[it.funcionarioId] ??= {})[c.campo] = true; }
        }
      }
      setMarcados(init);
      showToast(`${d.itens.length} funcionários com diferenças · ${d.novos.length} novos`, "success");
    } catch (e) {
      setErro(e.message);
    } finally {
      setAnalisando(false);
    }
  };

  const toggle = (fid, campo) =>
    setMarcados((m) => {
      const cur = { ...(m[fid] || {}) };
      if (cur[campo]) delete cur[campo]; else cur[campo] = true;
      return { ...m, [fid]: cur };
    });

  const totalMarcados = useMemo(
    () => Object.values(marcados).reduce((s, c) => s + Object.values(c).filter(Boolean).length, 0),
    [marcados]
  );

  const aplicar = async () => {
    const mudancas = [];
    for (const it of resultado.itens) {
      const sel = marcados[it.funcionarioId] || {};
      const campos = {};
      for (const c of it.campos) if (sel[c.campo]) campos[c.campo] = c.planilha;
      if (Object.keys(campos).length) mudancas.push({ funcionarioId: it.funcionarioId, campos });
    }
    if (mudancas.length === 0) { showToast("Marque ao menos uma mudança", "error"); return; }
    if (!confirm(`Aplicar ${totalMarcados} alterações em ${mudancas.length} funcionários?`)) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/rh/funcionarios/reconciliar/aplicar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mudancas }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao aplicar");
      showToast(`${d.atualizados} funcionários atualizados${d.erros?.length ? ` · ${d.erros.length} erros` : ""}`, d.erros?.length ? "error" : "success");
      // Remove os já aplicados da tela
      setResultado((res) => ({ ...res, itens: res.itens.filter((it) => !mudancas.some((m) => m.funcionarioId === it.funcionarioId)) }));
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const itensVisiveis = useMemo(() => {
    if (!resultado) return [];
    return soDivergencia
      ? resultado.itens.filter((it) => it.campos.some((c) => c.acao === "corrigir"))
      : resultado.itens;
  }, [resultado, soDivergencia]);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <Link href="/rh/funcionarios" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5 mb-2">
          <ArrowLeft size={15} /> Voltar para Funcionários
        </Link>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <GitCompareArrows className="text-torg-blue" /> Reconciliar com planilha
        </h2>
        <p className="text-sm text-torg-gray mt-1">Compare o cadastro do portal com as planilhas de fechamento (TORG/VMI) e aprove o que preencher/corrigir.</p>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark">Planilhas de fechamento</h3>
            <p className="text-sm text-torg-gray mt-1">Selecione a da TORG e/ou da VMI (.xlsx). Lê os ativos das abas de folha + dados das abas CADASTRO.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 cursor-pointer">
              <Upload size={16} /> Selecionar
              <input type="file" accept=".xlsx,.xls" multiple className="hidden"
                onChange={(e) => setArquivos(Array.from(e.target.files || []))} />
            </label>
            <button onClick={analisar} disabled={analisando || arquivos.length === 0}
              className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50">
              {analisando ? <Loader2 size={16} className="animate-spin" /> : <GitCompareArrows size={16} />} Comparar
            </button>
          </div>
        </div>
        {arquivos.length > 0 && (
          <p className="text-xs text-torg-gray mt-3">{arquivos.map((a) => a.name).join(" · ")}</p>
        )}
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}

      {resultado && (
        <>
          {/* Resumo + ações */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-torg-gray">Empresas: <strong className="text-torg-dark">{resultado.empresas.join(", ") || "—"}</strong></span>
              <span className="text-green-700">{resultado.resumo.preencher} a preencher</span>
              <span className="text-amber-700">{resultado.resumo.corrigir} divergências</span>
              <span className="text-torg-gray">{resultado.novos.length} novos (não no portal)</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSoDivergencia((v) => !v)}
                className={`px-3 py-2 text-xs rounded-lg border inline-flex items-center gap-1.5 ${soDivergencia ? "bg-amber-50 border-amber-200 text-amber-700" : "border-gray-200 text-torg-gray"}`}>
                <Filter size={13} /> Só divergências
              </button>
              <button onClick={aplicar} disabled={salvando || totalMarcados === 0}
                className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Aplicar {totalMarcados > 0 ? `(${totalMarcados})` : ""}
              </button>
            </div>
          </div>

          {/* Tabela de diffs */}
          {itensVisiveis.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
              <CheckCircle2 size={40} className="mx-auto text-green-400 mb-3" />
              <p className="text-torg-gray">Nada a reconciliar {soDivergencia ? "(sem divergências)" : ""} — cadastro alinhado com a planilha.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50/60 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Funcionário</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Campo</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">No portal</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Na planilha</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase w-20">Aplicar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {itensVisiveis.map((it) =>
                      it.campos.map((c, ci) => (
                        <tr key={it.funcionarioId + c.campo} className={c.acao === "corrigir" ? "bg-amber-50/30" : ""}>
                          {ci === 0 && (
                            <td className="px-3 py-2 align-top" rowSpan={it.campos.length}>
                              <div className="font-medium text-torg-dark">{it.portalNome}</div>
                              <div className="text-[10px] text-torg-gray mt-0.5">
                                {it.empresa} · {it.tipoContrato} ·{" "}
                                <span className={`px-1.5 py-0.5 rounded-full ${CONF_COR[it.confianca] || ""}`}>match: {it.matchPor}</span>
                              </div>
                            </td>
                          )}
                          <td className="px-3 py-2 text-torg-gray">{LABEL[c.campo] || c.campo}</td>
                          <td className="px-3 py-2 text-torg-gray">{c.portal || <span className="italic text-gray-300">vazio</span>}</td>
                          <td className="px-3 py-2 text-torg-dark font-medium">{c.planilha}</td>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox"
                              checked={!!marcados[it.funcionarioId]?.[c.campo]}
                              onChange={() => toggle(it.funcionarioId, c.campo)}
                              className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Novos (não criados automaticamente) */}
          {resultado.novos.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-2">
                <UserPlus size={16} className="text-torg-gray" /> {resultado.novos.length} na planilha sem cadastro no portal
              </h3>
              <p className="text-xs text-torg-gray mb-3">Não são criados automaticamente — cadastre manualmente ou pela importação por Excel se forem válidos.</p>
              <div className="flex flex-wrap gap-2">
                {resultado.novos.map((n, i) => (
                  <span key={i} className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-torg-gray">
                    {n.nome} <span className="text-gray-400">· {n.empresa} · {n.tipoContrato}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
