"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Plus, Upload, Loader2, AlertCircle, Trash2, ExternalLink, Send, CheckCircle2, Search,
} from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtCnpj = (s) => {
  if (!s) return null;
  const c = s.replace(/\D/g, "");
  if (c.length !== 14) return s;
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

export default function FDAvulsosSection({ opId, pedidos = [], podeEditar = true, categoriasOP = [], rmsAtivas = [] }) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [erro, setErro] = useState("");
  const [criandoOmieId, setCriandoOmieId] = useState(null);

  const total = pedidos.reduce((s, p) => s + (p.total || 0), 0);

  const criarNoOmie = async (p) => {
    if (!window.confirm(`Criar o pedido no Omie pra ${p.fornecedorNome} (${fmtMoeda(p.total)})?\n\nO sistema vai gerar 1 item genérico com o valor total. O PDF anexado também será enviado ao Omie.`)) return;
    setErro("");
    setCriandoOmieId(p.id);
    try {
      const res = await fetch(`/api/comercial/pedido-fd-avulso/${p.id}/criar-omie`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setCriandoOmieId(null);
    }
  };

  const remover = async (p) => {
    if (!window.confirm(`Remover o FD avulso de ${p.fornecedorNome} (${fmtMoeda(p.total)})?\n\nApenas o registro no portal é removido — o pedido no Omie continua intacto.`)) return;
    try {
      const res = await fetch(`/api/comercial/pedido-fd-avulso/${p.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <FileText size={18} className="text-amber-700" />
            FDs avulsos / Regularização ({pedidos.length})
          </h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Pedidos de Faturamento Direto cadastrados manualmente — pra contabilizar compras
            antigas que já existem no Omie mas não passaram pelo fluxo RM → Cotação.
            Anexe o PDF da NF/pedido pra ter o histórico organizado.
          </p>
        </div>
        {podeEditar && (
          <button
            onClick={() => setModal(true)}
            className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 inline-flex items-center gap-1"
          >
            <Plus size={14} /> Incluir FD avulso
          </button>
        )}
      </div>

      {erro && (
        <div className="mx-6 mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          <button onClick={() => setErro("")} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {pedidos.length === 0 ? (
        <p className="px-6 py-6 text-sm text-torg-gray text-center italic">
          Nenhum FD avulso cadastrado. Use "Incluir FD avulso" pra regularizar compras existentes no Omie.
        </p>
      ) : (
        <>
          {/* Resumo */}
          <div className="px-6 py-3 bg-amber-50/40 border-b border-amber-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-torg-gray">Total cadastrado como FD avulso</span>
            <span className="text-lg font-extrabold text-amber-700 tabular-nums">{fmtMoeda(total)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pedido Omie</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">PDF</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pedidos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <p className="text-torg-dark font-medium">{p.fornecedorNome}</p>
                      {p.cnpj && <p className="text-[10px] text-torg-gray font-mono">{fmtCnpj(p.cnpj)}</p>}
                    </td>
                    <td className="px-4 py-2">
                      {p.categoriaItem ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium whitespace-nowrap">
                          {labelCategoria(p.categoriaItem)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-torg-gray italic">não classificado</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {p.numeroPedido || p.codigoPedido ? (
                        <span className="text-torg-blue font-semibold">
                          {p.numeroPedido || p.codigoPedido}
                        </span>
                      ) : (
                        <span className="text-torg-gray italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-torg-dark text-xs max-w-xs truncate" title={p.observacao || ""}>
                      {p.observacao || "—"}
                    </td>
                    <td className="px-4 py-2 text-torg-gray text-xs">{fmtData(p.createdAt)}</td>
                    <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">
                      {fmtMoeda(p.total)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.status === "CRIADO" ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium inline-flex items-center gap-1">
                          <CheckCircle2 size={10} /> No Omie
                        </span>
                      ) : p.status === "PENDENTE_OMIE" || p.status === "ERRO" ? (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium"
                          title={p.erroOmie ? `Última tentativa de envio falhou: ${p.erroOmie}` : "FD registrado, pendente de criação no Omie"}
                        >
                          FD
                        </span>
                      ) : (
                        <span className="text-[10px] text-torg-gray">{p.status || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.anexoUrl ? (
                        <a
                          href={p.anexoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-torg-blue hover:underline"
                          title={p.anexoNome || "Abrir PDF"}
                        >
                          <ExternalLink size={12} /> PDF
                        </a>
                      ) : (
                        <span className="text-torg-gray text-xs italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        {podeEditar && (p.status === "PENDENTE_OMIE" || p.status === "ERRO") && (
                          <button
                            onClick={() => criarNoOmie(p)}
                            disabled={criandoOmieId === p.id}
                            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 inline-flex items-center gap-1 disabled:opacity-50"
                            title="Cria o pedido no Omie via API"
                          >
                            {criandoOmieId === p.id ? (
                              <><Loader2 size={12} className="animate-spin" /> Criando...</>
                            ) : (
                              <><Send size={12} /> Criar no Omie</>
                            )}
                          </button>
                        )}
                        {podeEditar && (
                          <button
                            onClick={() => remover(p)}
                            className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                            title="Remover (apenas o registro local)"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && (
        <ModalNovoFDAvulso
          opId={opId}
          categoriasOP={categoriasOP}
          rmsAtivas={rmsAtivas}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ModalNovoFDAvulso({ opId, categoriasOP = [], rmsAtivas = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    fornecedorNome: "",
    cnpj: "",
    numeroPedido: "",
    total: "",
    observacao: "",
    categoriaItem: "",
    jaExisteNoOmie: true, // true = regularizacao, false = criar depois
    rmAtendidaId: "", // RM que esse FD cobre (opcional)
  });
  // Itens detalhados (opcional) — quando preenchido, total e calculado.
  // Quando vazio, usuario digita total direto no campo "Valor total".
  const [itens, setItens] = useState([]);
  const [file, setFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const addItem = () => {
    setItens([...itens, { codigo: "", descricao: "", qtd: "", unidade: "UN", valorUnit: "", ipiPct: "", icmsPct: "" }]);
  };
  const removerItem = (idx) => {
    setItens(itens.filter((_, i) => i !== idx));
  };
  const setItem = (idx, campo, valor) => {
    setItens(itens.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  };

  // Total calculado dos itens (se houver)
  const totalItens = itens.reduce((s, it) => {
    const qtd = parseFloat(String(it.qtd).replace(",", ".")) || 0;
    const valorUnit = parseFloat(String(it.valorUnit).replace(",", ".")) || 0;
    const ipi = parseFloat(String(it.ipiPct).replace(",", ".")) || 0;
    return s + qtd * valorUnit * (1 + ipi / 100);
  }, 0);
  const temItens = itens.length > 0 && itens.some((it) => it.descricao && it.qtd && it.valorUnit);

  const submit = async () => {
    setErro("");
    if (!form.fornecedorNome.trim()) return setErro("Informe o fornecedor.");

    // Itens detalhados (opcional)
    const itensValidos = itens
      .map((it) => ({
        codigo: it.codigo ? String(it.codigo).trim() : null,
        descricao: it.descricao.trim(),
        qtd: parseFloat(String(it.qtd).replace(",", ".")) || 0,
        unidade: it.unidade || "UN",
        valorUnit: parseFloat(String(it.valorUnit).replace(",", ".")) || 0,
        ipiPct: parseFloat(String(it.ipiPct).replace(",", ".")) || 0,
        icmsPct: parseFloat(String(it.icmsPct).replace(",", ".")) || 0,
      }))
      .filter((it) => it.descricao && it.qtd > 0 && it.valorUnit > 0);

    let total;
    if (itensValidos.length > 0) {
      total = itensValidos.reduce(
        (s, it) => s + it.qtd * it.valorUnit * (1 + it.ipiPct / 100),
        0
      );
    } else {
      total = parseFloat(String(form.total).replace(",", "."));
      if (!total || total <= 0) return setErro("Informe o valor total (maior que 0) ou pelo menos 1 item detalhado.");
    }

    setSalvando(true);
    try {
      const fd = new FormData();
      fd.append("dados", JSON.stringify({
        fornecedorNome: form.fornecedorNome.trim(),
        cnpj: form.cnpj?.replace(/\D/g, "") || null,
        numeroPedido: form.numeroPedido?.trim() || null,
        total,
        observacao: form.observacao?.trim() || null,
        categoriaItem: form.categoriaItem || null,
        faturamentoDireto: true,
        jaExisteNoOmie: form.jaExisteNoOmie,
        itensDetalhes: itensValidos.length > 0 ? itensValidos : null,
        rmAtendidaId: form.rmAtendidaId || null,
      }));
      if (file) fd.append("file", file);

      const res = await fetch(`/api/comercial/op/${opId}/pedido-fd-avulso`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <FileText size={18} className="text-amber-700" />
            Incluir FD avulso
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <p className="font-semibold">Cenários de uso</p>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={form.jaExisteNoOmie === true}
                  onChange={() => setForm({ ...form, jaExisteNoOmie: true })}
                  className="mt-0.5 w-4 h-4 text-amber-600 focus:ring-amber-600"
                />
                <div>
                  <p className="font-medium">📋 Regularização (pedido já existe no Omie)</p>
                  <p className="text-[11px] opacity-90">
                    A compra já foi feita e o pedido criado direto no Omie. Você só está cadastrando aqui pra contabilizar no saldo FD da OP.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={form.jaExisteNoOmie === false}
                  onChange={() => setForm({ ...form, jaExisteNoOmie: false })}
                  className="mt-0.5 w-4 h-4 text-amber-600 focus:ring-amber-600"
                />
                <div>
                  <p className="font-medium">📤 Criar pedido novo no Omie</p>
                  <p className="text-[11px] opacity-90">
                    Você tem o PDF/proposta do fornecedor e quer registrar pra depois <strong>disparar a criação do pedido no Omie via API</strong>. O cadastro fica como "Pendente" e tem botão "Criar no Omie" na tabela.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Fornecedor *</label>
            <input
              type="text"
              value={form.fornecedorNome}
              onChange={(e) => setForm({ ...form, fornecedorNome: e.target.value })}
              placeholder="Ex: R Simioni Comércio Ltda"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">CNPJ (opcional)</label>
              <input
                type="text"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">
                Nº Pedido no Omie
                {!form.jaExisteNoOmie && <span className="text-torg-gray font-normal"> (será gerado)</span>}
              </label>
              <input
                type="text"
                value={form.jaExisteNoOmie ? form.numeroPedido : ""}
                onChange={(e) => setForm({ ...form, numeroPedido: e.target.value })}
                placeholder={form.jaExisteNoOmie ? "Ex: 1500" : "Gerado pelo Omie ao criar"}
                disabled={!form.jaExisteNoOmie}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue disabled:bg-gray-50 disabled:text-torg-gray"
              />
            </div>
          </div>

          {/* Itens detalhados (opcional) — quando preenchido, total e calculado.
              Quando vazio, usuario informa total no campo "Valor total". */}
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block text-xs font-semibold text-torg-dark">
                  Itens do pedido (opcional)
                </label>
                <p className="text-[10px] text-torg-gray">
                  Recomendado quando vai <strong>criar o pedido no Omie</strong> — descrição vira o item no Omie.
                  Se deixar vazio, o sistema cria 1 item genérico com o valor total embutido.
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="text-xs px-2 py-1 bg-torg-blue text-white rounded font-medium hover:bg-torg-blue-700 inline-flex items-center gap-1"
              >
                <Plus size={12} /> Adicionar item
              </button>
            </div>

            {itens.length > 0 && (
              <div className="space-y-2 mb-2">
                {itens.map((it, idx) => {
                  const subtotal = (parseFloat(String(it.qtd).replace(",", ".")) || 0)
                    * (parseFloat(String(it.valorUnit).replace(",", ".")) || 0)
                    * (1 + (parseFloat(String(it.ipiPct).replace(",", ".")) || 0) / 100);
                  return (
                    <div key={idx} className="bg-white border border-gray-200 rounded p-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <AutocompleteProdutoOmie
                            valor={it.descricao}
                            codigoAtual={it.codigo}
                            onSelecionarItem={(p) => {
                              setItens((prev) => prev.map((x, i) => i === idx ? {
                                ...x,
                                codigo: p.codigo,
                                descricao: p.descricao,
                                unidade: p.unidade || x.unidade || "UN",
                              } : x));
                            }}
                            onChangeTexto={(txt) => setItem(idx, "descricao", txt)}
                          />
                          <div className="flex items-center gap-2">
                            <label className="text-[9px] text-torg-gray uppercase whitespace-nowrap">Cód. Omie</label>
                            <input
                              type="text"
                              value={it.codigo || ""}
                              onChange={(e) => setItem(idx, "codigo", e.target.value)}
                              placeholder="Cole aqui se já tem (opcional)"
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-[11px] font-mono focus:ring-1 focus:ring-torg-blue"
                            />
                            {it.codigo && (
                              <span className="text-[9px] text-emerald-700 font-medium whitespace-nowrap">✓ vinculado</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removerItem(idx)}
                          className="text-red-600 hover:text-red-800 mt-2"
                          title="Remover"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-12 gap-1.5">
                        <div className="col-span-2">
                          <label className="block text-[9px] text-torg-gray uppercase">Qtd</label>
                          <input
                            type="text"
                            value={it.qtd}
                            onChange={(e) => setItem(idx, "qtd", e.target.value)}
                            placeholder="1"
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs tabular-nums text-right focus:ring-1 focus:ring-torg-blue"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[9px] text-torg-gray uppercase">Un</label>
                          <input
                            type="text"
                            value={it.unidade}
                            onChange={(e) => setItem(idx, "unidade", e.target.value)}
                            placeholder="UN"
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs uppercase focus:ring-1 focus:ring-torg-blue"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[9px] text-torg-gray uppercase">Valor unit (R$)</label>
                          <input
                            type="text"
                            value={it.valorUnit}
                            onChange={(e) => setItem(idx, "valorUnit", e.target.value)}
                            placeholder="0,00"
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs tabular-nums text-right focus:ring-1 focus:ring-torg-blue"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[9px] text-torg-gray uppercase">IPI %</label>
                          <input
                            type="text"
                            value={it.ipiPct}
                            onChange={(e) => setItem(idx, "ipiPct", e.target.value)}
                            placeholder="0"
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs tabular-nums text-right focus:ring-1 focus:ring-torg-blue"
                          />
                        </div>
                        <div className="col-span-3 text-right pt-3">
                          <p className="text-[9px] text-torg-gray uppercase">Subtotal</p>
                          <p className="text-xs text-torg-dark font-bold tabular-nums">{fmtMoeda(subtotal)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-end pt-1 text-xs">
                  <span className="text-torg-gray mr-2">Total dos itens:</span>
                  <span className="text-torg-dark font-bold tabular-nums">{fmtMoeda(totalItens)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">
              Valor total da NF (R$) {!temItens && <span className="text-red-600">*</span>}
              {temItens && <span className="text-emerald-700 font-normal"> — calculado dos itens</span>}
            </label>
            <input
              type="text"
              value={temItens ? totalItens.toFixed(2).replace(".", ",") : form.total}
              onChange={(e) => setForm({ ...form, total: e.target.value })}
              placeholder="Ex: 15000,00"
              disabled={temItens}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue disabled:bg-emerald-50/50 disabled:text-torg-dark"
            />
          </div>

          {/* Vinculo com RM (opcional) — ao selecionar, marca a RM como
              PEDIDO_GERADO e tira ela da lista do Compras */}
          {rmsAtivas.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">
                Esse FD atende qual RM? <span className="text-torg-gray font-normal">(opcional)</span>
              </label>
              <select
                value={form.rmAtendidaId}
                onChange={(e) => setForm({ ...form, rmAtendidaId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
              >
                <option value="">— Nenhuma (FD avulso solto) —</option>
                {rmsAtivas.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    RM {rm.numero} ({rm.status})
                  </option>
                ))}
              </select>
              {form.rmAtendidaId && (
                <p className="text-[10px] text-emerald-700 mt-0.5 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                  ✓ Ao salvar, a RM <strong>{rmsAtivas.find((r) => r.id === form.rmAtendidaId)?.numero}</strong> vai mudar para <strong>PEDIDO_GERADO</strong> e sair da lista de RMs ativas do Compras.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">
              Categoria do material {categoriasOP.length === 0 && <span className="text-torg-gray font-normal">(OP sem categorias no escopo)</span>}
            </label>
            <select
              value={form.categoriaItem}
              onChange={(e) => setForm({ ...form, categoriaItem: e.target.value })}
              disabled={categoriasOP.length === 0}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white disabled:bg-gray-50 disabled:text-torg-gray"
            >
              <option value="">— Selecione a categoria —</option>
              {categoriasOP.map((cat) => (
                <option key={cat} value={cat}>{labelCategoria(cat)}</option>
              ))}
            </select>
            <p className="text-[10px] text-torg-gray mt-0.5">
              Categorias do escopo da OP. Usado pra agrupar/conferir o saldo por tipo de material.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Descrição (opcional)</label>
            <input
              type="text"
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Ex: Compra de chapas — NF 12345"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">PDF da NF/pedido</label>
            <label className="cursor-pointer flex items-center gap-3 border-2 border-dashed border-gray-300 rounded-lg px-3 py-3 hover:border-torg-blue hover:bg-torg-blue-50/30 transition-colors">
              <Upload size={18} className="text-torg-gray flex-shrink-0" />
              <span className="text-xs text-torg-gray flex-1">
                {file ? (
                  <span className="text-torg-dark font-medium">{file.name}</span>
                ) : (
                  "Clique pra selecionar o PDF (até 20MB)"
                )}
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-[10px] text-red-600 hover:text-red-800 mt-1"
              >
                × remover arquivo
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={salvando}
            className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Cadastrar FD avulso
          </button>
        </div>
      </div>
    </div>
  );
}

// Autocomplete que busca produtos no Omie (ou no Estoque Torg local).
// Quando o usuario seleciona uma sugestao, dispara onSelecionarItem(produto)
// com { codigo, descricao, unidade }. Pra texto livre (sem seleção), dispara
// onChangeTexto(txt) — assim o sistema cria com codigo=null (produto generico).
function AutocompleteProdutoOmie({ valor, codigoAtual, onSelecionarItem, onChangeTexto }) {
  const [busca, setBusca] = useState(valor || "");
  const [sugestoes, setSugestoes] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [origem, setOrigem] = useState(null);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);

  // Sincroniza state local quando valor externo muda
  useEffect(() => {
    if (valor !== busca) setBusca(valor || "");
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce de busca
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!busca || busca.length < 2) {
      setSugestoes([]);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      setCarregando(true);
      try {
        const res = await fetch(`/api/omie/buscar-produto?q=${encodeURIComponent(busca)}&limit=15`);
        const data = await res.json();
        setSugestoes(data.itens || []);
        setOrigem(data.origem);
      } catch (e) {
        setSugestoes([]);
      } finally {
        setCarregando(false);
      }
    }, 400);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [busca]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selecionar = (produto) => {
    setBusca(produto.descricao);
    setAberto(false);
    onSelecionarItem(produto);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input
          type="text"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            onChangeTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          placeholder="Buscar produto Omie ou digitar descrição"
          className="w-full border border-gray-300 rounded pl-7 pr-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
        />
        {carregando && (
          <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-torg-gray animate-spin" />
        )}
      </div>

      {aberto && busca.length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {sugestoes.length === 0 && !carregando ? (
            <div className="px-3 py-2 text-[11px] text-torg-gray italic">
              {busca.length < 2 ? "Digite ao menos 2 caracteres..." : "Nenhum produto encontrado. Você pode usar a descrição digitada (cria como item genérico no Omie)."}
            </div>
          ) : (
            <>
              {sugestoes.map((p, i) => (
                <button
                  key={`${p.codigo}-${i}`}
                  type="button"
                  onClick={() => selecionar(p)}
                  className="w-full text-left px-3 py-2 hover:bg-torg-blue-50 border-b border-gray-100 last:border-b-0"
                >
                  <p className="text-xs text-torg-dark font-medium truncate">{p.descricao}</p>
                  <p className="text-[10px] text-torg-gray font-mono">
                    {p.codigo} {p.unidade && `· ${p.unidade}`}
                  </p>
                </button>
              ))}
              {origem === "estoque-local" && (
                <p className="px-3 py-1.5 text-[9px] text-torg-gray italic bg-gray-50 border-t border-gray-100">
                  Resultados do Estoque Torg (sincronizado do Omie)
                </p>
              )}
              {origem === "omie" && (
                <p className="px-3 py-1.5 text-[9px] text-torg-gray italic bg-gray-50 border-t border-gray-100">
                  Resultados direto do Omie
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
