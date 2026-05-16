"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Plus, Upload, Loader2, AlertCircle, Trash2, ExternalLink,
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

export default function FDAvulsosSection({ opId, pedidos = [], podeEditar = true, categoriasOP = [] }) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [erro, setErro] = useState("");

  const total = pedidos.reduce((s, p) => s + (p.total || 0), 0);

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
                      {podeEditar && (
                        <button
                          onClick={() => remover(p)}
                          className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                          title="Remover (apenas o registro local)"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
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
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ModalNovoFDAvulso({ opId, categoriasOP = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    fornecedorNome: "",
    cnpj: "",
    numeroPedido: "",
    total: "",
    observacao: "",
    categoriaItem: "",
  });
  const [file, setFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const submit = async () => {
    setErro("");
    if (!form.fornecedorNome.trim()) return setErro("Informe o fornecedor.");
    const total = parseFloat(form.total.replace(",", "."));
    if (!total || total <= 0) return setErro("Informe o valor total (maior que 0).");

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
            <p className="font-semibold">Quando usar este cadastro</p>
            <p className="mt-1">
              Pra <strong>regularizar</strong> compras de Faturamento Direto que já existem no Omie
              mas não passaram pelo fluxo RM → Cotação do portal. O sistema vai considerar o valor
              no saldo FD da OP pra evitar que o teto seja ultrapassado.
            </p>
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
              <label className="block text-xs font-medium text-torg-dark mb-1">Nº Pedido no Omie</label>
              <input
                type="text"
                value={form.numeroPedido}
                onChange={(e) => setForm({ ...form, numeroPedido: e.target.value })}
                placeholder="Ex: 1500"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor total da NF (R$) *</label>
            <input
              type="text"
              value={form.total}
              onChange={(e) => setForm({ ...form, total: e.target.value })}
              placeholder="Ex: 15000,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>

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
