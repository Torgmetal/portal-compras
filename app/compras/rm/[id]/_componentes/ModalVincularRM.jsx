"use client";
import { useState, useMemo } from "react";
import { fmtOP } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { Modal } from "./Modal";

// Modal pra adicionar RMs a uma cotação ja existente
export function ModalVincularRM({ cotacao, outrasRMs, onClose }) {
  const router = useRouter();
  const [rmsSelecionadas, setRmsSelecionadas] = useState(new Set());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const toggle = (id) => {
    setRmsSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const itensTotal = useMemo(() => {
    let n = 0;
    for (const r of outrasRMs) {
      if (rmsSelecionadas.has(r.id)) {
        n += r.itens.filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)).length;
      }
    }
    return n;
  }, [outrasRMs, rmsSelecionadas]);

  const submit = async () => {
    setErro("");
    if (rmsSelecionadas.size === 0) return setErro("Selecione ao menos 1 RM.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/cotacao/${cotacao.id}/adicionar-rm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rmIds: Array.from(rmsSelecionadas) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      let msg = `✓ ${data.itensCriados} itens adicionados (RMs: ${data.rmsAdicionadas.join(", ")})`;
      if (data.estoque) {
        const partes = [
          ...(data.estoque.abatidos || []).map((a) => `${a.descricao}: ${a.barrasDisponiveis} ${a.unidade} em estoque, cotado só ${a.barrasACotar} ${a.unidade}`),
          ...(data.estoque.excluidos || []).map((e2) => `${e2.descricao}: 100% em estoque — FORA da cotação (use "Atender estoque")`),
        ];
        if (partes.length) msg += `\n\nEstoque abatido:\n• ${partes.join("\n• ")}`;
      }
      alert(msg);
      onClose();
      router.refresh();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={`Vincular RM à cotação de ${cotacao.fornecedorNome}`} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <div className="bg-torg-orange-50/40 border border-torg-orange-100 rounded-lg p-3 text-xs text-torg-dark">
          ⚠️ Os itens das RMs marcadas serão adicionados a essa cotação. O fornecedor vai precisar
          preencher os preços das novas linhas (você pode reenviar o link pra ele revisar).
          {cotacao.status === "RECEBIDA" && (
            <p className="mt-1">
              Como essa cotação já foi respondida, ela voltará pra status &quot;Aguardando&quot; até
              o fornecedor preencher os novos itens.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-torg-dark mb-2">
            RMs disponíveis ({rmsSelecionadas.size} selecionada{rmsSelecionadas.size !== 1 ? "s" : ""}, {itensTotal} itens)
          </label>
          <div className="border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto divide-y divide-gray-100">
            {outrasRMs.map((r) => {
              const itensCotaveis = r.itens.filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)).length;
              const checked = rmsSelecionadas.has(r.id);
              return (
                <label key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                  <input
                    type="checkbox" checked={checked}
                    onChange={() => toggle(r.id)}
                    className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                  />
                  <span className="font-mono font-semibold text-torg-blue">{r.numero}</span>
                  <span className="flex-1 truncate text-torg-dark">{r.descricao}</span>
                  {r.op && (
                    <span className="text-[10px] text-torg-gray">{fmtOP(r.op.numero)}</span>
                  )}
                  <span className="text-[10px] text-torg-gray">{itensCotaveis} itens</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={salvando || rmsSelecionadas.size === 0}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />}
          Adicionar à cotação ({itensTotal} itens)
        </button>
      </div>
    </Modal>
  );
}
