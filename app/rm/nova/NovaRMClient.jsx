"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Loader2, AlertCircle, AlertTriangle, CheckCircle2, Plus, Trash2,
  Upload, FileSpreadsheet, X,
} from "lucide-react";
import { labelCategoria, getCategoria } from "@/lib/op-categorias";
import { parseTekla } from "@/lib/parse-tekla";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIPOS = [
  { value: "Material", label: "Material" },
  { value: "Consumível", label: "Consumível" },
];

// Threshold pra alerta de divergência: qty real > 1.05 × qty estimada
const THRESHOLD_DIVERGENCIA = 0.05;

export default function NovaRMClient({ ops, userSetor }) {
  const router = useRouter();
  const [opSelecionada, setOpSelecionada] = useState("");
  const [tipo, setTipo] = useState("Material");
  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [setor, setSetor] = useState(userSetor);
  const [itensSelecionados, setItensSelecionados] = useState({}); // {[opItemKey]: { qtdReal, descricaoExtra }}
  const [itensImportados, setItensImportados] = useState([]); // do xlsx
  const [arquivoNome, setArquivoNome] = useState("");
  const [importando, setImportando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const fileRef = useRef(null);

  const op = useMemo(() => ops.find((o) => o.id === opSelecionada), [ops, opSelecionada]);

  // Combina base + aditivos numa lista plana com identificação da origem
  const itensDisponiveis = useMemo(() => {
    if (!op) return [];
    const lista = [];
    for (const i of op.itens) {
      lista.push({
        chave: `op:${i.id}`,
        opItemId: i.id,
        aditivoItemId: null,
        origem: "Base",
        ...i,
      });
    }
    for (const ad of op.aditivos) {
      for (const i of ad.itens) {
        lista.push({
          chave: `ad:${i.id}`,
          opItemId: null,
          aditivoItemId: i.id,
          origem: `Aditivo ${ad.numero}`,
          ...i,
        });
      }
    }
    return lista;
  }, [op]);

  const setItem = (chave, key, value) => {
    setItensSelecionados((prev) => {
      const atual = prev[chave] || { qtdReal: 0, descricaoExtra: "" };
      return { ...prev, [chave]: { ...atual, [key]: value } };
    });
  };
  const toggleItem = (chave) => {
    setItensSelecionados((prev) => {
      const next = { ...prev };
      if (next[chave]) delete next[chave];
      else next[chave] = { qtdReal: 0, descricaoExtra: "" };
      return next;
    });
  };

  const itensComDivergencia = useMemo(() => {
    const lista = [];
    for (const [chave, sel] of Object.entries(itensSelecionados)) {
      const it = itensDisponiveis.find((d) => d.chave === chave);
      if (!it) continue;
      const estimado = Number(it.qtdContratada) || 0;
      const real = Number(sel.qtdReal) || 0;
      if (estimado > 0 && real > 0) {
        const diff = (real - estimado) / estimado;
        if (Math.abs(diff) > THRESHOLD_DIVERGENCIA) {
          lista.push({ chave, descricao: it.descricao, estimado, real, diffPct: diff * 100, unidade: it.unidade });
        }
      }
    }
    return lista;
  }, [itensSelecionados, itensDisponiveis]);

  const importarArquivo = async (file) => {
    if (!file) return;
    setImportando(true);
    setErro("");
    try {
      const { meta, itens } = await parseTekla(file);
      if (itens.length === 0) {
        setErro("Nenhum item encontrado na planilha.");
        return;
      }
      setItensImportados(itens);
      setArquivoNome(file.name);
      // Pré-preenche descrição se vazia
      if (!descricao && (meta.cliente || meta.obra)) {
        const parts = [meta.rmRef, meta.obra, meta.cliente].filter(Boolean);
        if (parts.length) setDescricao(`Importação ${parts.join(" — ")}`);
      }
    } catch (e) {
      setErro("Erro ao ler arquivo: " + e.message);
    } finally {
      setImportando(false);
    }
  };

  const removerImportado = (idx) => {
    setItensImportados((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setErro("");
    if (!opSelecionada) return setErro("Escolha uma OP.");
    if (!descricao.trim()) return setErro("Descreva a RM.");

    // Itens vinculados a OP
    const itensManuais = Object.entries(itensSelecionados)
      .map(([chave, sel]) => {
        const it = itensDisponiveis.find((d) => d.chave === chave);
        if (!it) return null;
        return {
          opItemId: it.opItemId,
          aditivoItemId: it.aditivoItemId,
          descricao: sel.descricaoExtra || it.descricao,
          unidade: it.unidade || "UN",
          qtd: Number(sel.qtdReal) || 0,
        };
      })
      .filter((x) => x && x.qtd > 0);

    // Itens da planilha (sem vínculo direto a OPItem)
    const itensXlsx = itensImportados.map((it) => ({
      opItemId: null,
      aditivoItemId: null,
      descricao: it.descricao,
      unidade: it.unidade || "UN",
      qtd: Number(it.qtd) || 0,
      codigo: it.codigo || null,
      material: it.material || null,
      comprimento: it.comprimento || null,
      largura: it.largura || null,
      tratamento: it.tratamento || null,
      peso: Number(it.peso) || null,
      pesoLinear: Number(it.pesoLinear) || null,
    }));

    const itensValidos = [...itensManuais, ...itensXlsx];

    if (itensValidos.length === 0) {
      return setErro("Adicione pelo menos um item (selecione da OP ou suba uma planilha).");
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/rm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opId: opSelecionada,
          tipo,
          descricao: descricao.trim(),
          observacao: observacao.trim() || null,
          setor: setor || null,
          itens: itensValidos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar RM");
      router.push(`/rm/${data.id}`);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/rm" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Nova RM</h2>
        <p className="text-sm text-torg-gray mt-1">
          Escolha a OP, selecione os itens e preencha as quantidades reais. Divergências serão sinalizadas pra Compras.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Step 1: dados gerais */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-torg-dark">Dados gerais</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Ordem de Produção (OP) *</label>
            <select
              value={opSelecionada}
              onChange={(e) => { setOpSelecionada(e.target.value); setItensSelecionados({}); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              <option value="">— Escolher —</option>
              {ops.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.numero} — {o.cliente} {o.obra ? `(${o.obra})` : ""}
                </option>
              ))}
            </select>
            {ops.length === 0 && (
              <p className="mt-1 text-xs text-torg-orange-700">
                Nenhuma OP ativa no momento. Solicite ao Comercial criar uma OP.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Descrição da RM *</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Compra inicial de chapas pra início da fabricação"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Setor</label>
            <input
              type="text"
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              placeholder="Ex: Engenharia"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Observação</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
      </div>

      {/* Step 2: importar planilha (Tekla) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-torg-blue" /> Importar planilha (Tekla)
            </h3>
            <p className="text-sm text-torg-gray mt-1">
              Sobe o .xlsx exportado do Tekla. Cada linha vira um item da RM com peso, perfil, etc.
            </p>
          </div>
          {itensImportados.length > 0 && (
            <span className="text-xs bg-torg-blue-50 text-torg-blue px-3 py-1 rounded-full font-medium">
              {itensImportados.length} itens · {itensImportados.reduce((s, it) => s + (it.peso || 0), 0).toFixed(2)} kg total
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importando}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {importando ? "Lendo..." : arquivoNome ? "Trocar arquivo" : "Selecionar .xlsx"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { importarArquivo(e.target.files[0]); e.target.value = ""; }}
          />
          {arquivoNome && (
            <span className="text-sm text-torg-gray flex items-center gap-2">
              <CheckCircle2 size={14} className="text-torg-orange" />
              {arquivoNome}
              <button
                type="button"
                onClick={() => { setItensImportados([]); setArquivoNome(""); }}
                className="text-red-400 hover:text-red-600 ml-1"
              >
                <X size={14} />
              </button>
            </span>
          )}
        </div>

        {itensImportados.length > 0 && (
          <div className="mt-4 max-h-[300px] overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase w-8">#</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Unid.</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Comp.</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">Peso (kg)</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itensImportados.slice(0, 200).map((it, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-torg-dark font-medium">{it.descricao}</td>
                    <td className="px-3 py-1.5 text-torg-gray">{it.material || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">{it.qtd}</td>
                    <td className="px-3 py-1.5 text-torg-gray">{it.unidade || "UN"}</td>
                    <td className="px-3 py-1.5 text-torg-gray">{it.comprimento || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-torg-dark tabular-nums">
                      {it.peso > 0 ? it.peso.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => removerImportado(i)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {itensImportados.length > 200 && (
              <p className="text-center text-xs text-torg-gray py-2">
                Exibindo 200 de {itensImportados.length} itens
              </p>
            )}
          </div>
        )}
      </div>

      {/* Step 3: seleção de itens da OP (opcional, complementa o xlsx) */}
      {op && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-torg-dark">
              Itens da {op.numero} (opcional, {itensDisponiveis.length} disponíveis)
            </h3>
            <p className="text-sm text-torg-gray mt-1">
              Marque os itens que essa RM consome diretamente da OP (com qtd real). Use isso quando não tem planilha — ou pra adicionar consumos extras junto com a planilha acima.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Origem</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Estimativa</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd real *</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Detalhe (opcional)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itensDisponiveis.map((it) => {
                  const sel = itensSelecionados[it.chave];
                  const checked = !!sel;
                  return (
                    <tr key={it.chave} className={checked ? "bg-torg-blue-50/30" : ""}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(it.chave)}
                          className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${
                          it.origem === "Base" ? "bg-gray-100 text-gray-700" : "bg-torg-orange-50 text-torg-orange-700"
                        }`}>
                          {it.origem}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-torg-gray">{labelCategoria(it.categoria)}</td>
                      <td className="px-3 py-2 text-torg-dark font-medium">{it.descricao}</td>
                      <td className="px-3 py-2 text-right text-torg-gray text-xs tabular-nums">
                        {it.qtdContratada
                          ? `${it.qtdContratada} ${it.unidade || ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={sel?.qtdReal ?? ""}
                          onChange={(e) => setItem(it.chave, "qtdReal", parseFloat(e.target.value) || 0)}
                          disabled={!checked}
                          placeholder={it.unidade || ""}
                          className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right tabular-nums focus:ring-1 focus:ring-torg-blue disabled:bg-gray-50"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={sel?.descricaoExtra ?? ""}
                          onChange={(e) => setItem(it.chave, "descricaoExtra", e.target.value)}
                          disabled={!checked}
                          placeholder="Especifique se precisar"
                          className="w-full min-w-[160px] border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-torg-blue disabled:bg-gray-50"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Aviso de divergência */}
          {itensComDivergencia.length > 0 && (
            <div className="mx-6 my-4 bg-torg-orange-50 border border-torg-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-2 text-torg-orange-700">
                <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">
                    {itensComDivergencia.length} ite{itensComDivergencia.length === 1 ? "m" : "ns"} com divergência {">"}{" "}
                    {(THRESHOLD_DIVERGENCIA * 100).toFixed(0)}% da estimativa do comercial
                  </p>
                  <p className="text-xs text-torg-orange-700/80 mt-1">
                    Compras será notificada pra revisar com o comercial. Detalhe quando puder no campo &quot;Detalhe&quot;.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {itensComDivergencia.map((d) => (
                      <li key={d.chave} className="text-torg-dark">
                        <strong>{d.descricao}</strong>: estimado {d.estimado} {d.unidade}, real {d.real} {d.unidade}{" "}
                        <span className={d.diffPct > 0 ? "text-red-600 font-bold" : "text-torg-orange-700 font-bold"}>
                          ({d.diffPct > 0 ? "+" : ""}{d.diffPct.toFixed(1)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link
          href="/rm"
          className="px-5 py-2.5 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </Link>
        <button
          onClick={submit}
          disabled={salvando || !opSelecionada}
          className="px-6 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={16} className="animate-spin" />}
          {salvando ? "Salvando..." : "Criar RM"}
        </button>
      </div>
    </div>
  );
}
