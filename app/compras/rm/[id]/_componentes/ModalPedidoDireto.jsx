"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, Package } from "lucide-react";
import { Modal } from "./Modal";
import { fmtMoeda } from "../_lib/formatos";

export function ModalPedidoDireto({ rm, onClose, onGerado }) {
  const ehAluguel = rm.tipoRM === "ALUGUEL";
  const [fornecedores, setFornecedores] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [locais, setLocais] = useState([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [localEstoque, setLocalEstoque] = useState("");
  const [codigoServicoOmie, setCodigoServicoOmie] = useState("");
  const [prazoPagamento, setPrazoPagamento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/fornecedores").then((r) => r.json()).then((d) => setFornecedores(d.fornecedores || d.data || d || [])).catch(() => {});
    fetch("/api/omie/categorias").then((r) => r.json()).then((d) => setCategorias(d.categorias || [])).catch(() => {});
    fetch("/api/omie/locais-estoque").then((r) => r.json()).then((d) => setLocais(d.locais || [])).catch(() => {});
  }, []);

  // Selecionar do cadastro preenche nome/cnpj automaticamente
  const escolherFornecedor = (id) => {
    setFornecedorId(id);
    const f = (fornecedores || []).find((x) => x.id === id);
    if (f) { setFornecedorNome(f.razaoSocial || ""); setCnpj(f.cnpj || ""); }
  };

  const itensPendentes = (rm.itens || []).filter((it) => !["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(it.status) && !it.canceladoEm);
  // Valor do item: montagem usa valorTotal; aluguel tem fallback diária × dias
  // (× qtd de unidades) para registros antigos sem valorTotal preenchido
  const valorItem = (it) => {
    const unit = Number(it.valorTotal) > 0
      ? Number(it.valorTotal)
      : (Number(it.valorDiaria) || 0) * (Number(it.qtdDias) || 0);
    return unit * (Number(it.qtd) || 1);
  };
  const total = itensPendentes.reduce((s, it) => s + valorItem(it), 0);

  const gerar = async () => {
    setErro("");
    if (!fornecedorNome.trim()) return setErro(`Informe o fornecedor (${ehAluguel ? "locador" : "montador"}).`);
    if (!categoria) return setErro("Escolha a Categoria de Compra.");
    setGerando(true);
    try {
      const f = (fornecedores || []).find((x) => x.id === fornecedorId);
      const res = await fetch(`/api/rm/${rm.id}/gerar-pedido-direto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorNome: fornecedorNome.trim(),
          cnpj: cnpj.trim() || null,
          nCodOmie: f?.nCodOmie || null,
          categoria,
          localEstoque: localEstoque || null,
          codigoServicoOmie: codigoServicoOmie.trim() || null,
          prazoPagamento: prazoPagamento.trim() || null,
          observacao: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar pedido");
      alert(`✓ Pedido ${data.pedido?.numeroPedido || ""} criado no Omie — ${fmtMoeda(data.pedido?.total)} no extrato da OP ${rm.op?.numero || ""}.`);
      onGerado();
    } catch (e) {
      setErro(e.message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Modal titulo={`Gerar pedido Omie — ${ehAluguel ? "Aluguel de Equipamentos" : "Medição de Montagem"}`} onClose={onClose}>
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
          </div>
        )}

        {/* Resumo dos itens (valores informados pelo solicitante) */}
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{ehAluguel ? "Equipamento" : "Medição"}</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itensPendentes.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-1.5 text-torg-dark">
                    {it.descricao}
                    {ehAluguel && Number(it.valorDiaria) > 0 && Number(it.qtdDias) > 0 && (
                      <span className="block text-[11px] text-torg-gray">
                        {fmtMoeda(it.valorDiaria)}/dia × {it.qtdDias} dia{it.qtdDias > 1 ? "s" : ""}{Number(it.qtd) > 1 ? ` × ${it.qtd} un` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtMoeda(valorItem(it))}</td>
                </tr>
              ))}
              <tr className="bg-gray-50/60">
                <td className="px-3 py-1.5 font-bold text-torg-dark">TOTAL</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-torg-dark">{fmtMoeda(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-torg-gray mb-1">Fornecedor ({ehAluguel ? "locador" : "montador"}) — do cadastro</label>
            <select value={fornecedorId} onChange={(e) => escolherFornecedor(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">— Escolher do Vendor List (ou preencha abaixo) —</option>
              {(fornecedores || []).map((f) => (
                <option key={f.id} value={f.id}>{f.razaoSocial}{f.cnpj ? ` — ${f.cnpj}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Nome do fornecedor *</label>
            <input type="text" value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">CNPJ * <span className="font-normal">(precisa existir no Omie)</span></label>
            <input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Categoria de Compra *</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Selecione…</option>
              {(categorias || []).map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.descricao}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Local de estoque</label>
            <select value={localEstoque} onChange={(e) => setLocalEstoque(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">(padrão)</option>
              {(locais || []).map((l) => (
                <option key={l.codigo} value={l.codigo}>{l.descricao || l.codigo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Código do serviço no Omie</label>
            <input type="text" value={codigoServicoOmie} onChange={(e) => setCodigoServicoOmie(e.target.value)}
              placeholder={ehAluguel ? "Ex.: SERV-ALUG (recomendado)" : "Ex.: SERV-MONT (recomendado)"}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            <p className="text-[10px] text-torg-gray mt-0.5">Sem ele, o Omie tenta achar o item pela descrição — pode falhar.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Prazo de pagamento</label>
            <input type="text" value={prazoPagamento} onChange={(e) => setPrazoPagamento(e.target.value)}
              placeholder="Ex.: 28 dias"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-torg-gray mb-1">Observação (vai no pedido)</label>
            <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
        </div>

        <p className="text-[11px] text-torg-gray bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          Sem cotação: o pedido é criado direto no Omie com os valores informados pelo solicitante e
          fica vinculado à <strong>OP {rm.op?.numero}</strong> — o custo aparece no extrato/controle financeiro da obra.
        </p>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
        <button onClick={onClose} disabled={gerando} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={gerar} disabled={gerando || itensPendentes.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {gerando ? <Loader2 size={15} className="animate-spin" /> : <Package size={15} />}
          {gerando ? "Gerando no Omie…" : `Gerar pedido (${fmtMoeda(total)})`}
        </button>
      </div>
    </Modal>
  );
}
