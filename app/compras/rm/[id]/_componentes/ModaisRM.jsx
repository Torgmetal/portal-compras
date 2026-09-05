"use client";
import { useState } from "react";
import { AlertTriangle, Loader2, AlertCircle } from "lucide-react";
import { CATEGORIAS_MATERIAL, CATEGORIAS_SERVICOS_TERCEIRIZADOS, CATEGORIAS_ALUGUEL, CATEGORIA_OUTRO } from "@/lib/op-categorias";
import { Modal } from "./Modal";

export function ModalEncerrarRM({ rm, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const itensPendentes = rm.itens.filter((i) => i.status === "PENDENTE" || i.status === "EM_COTACAO" || i.status === "COTADO");

  const submit = async (force = false) => {
    if (!motivo.trim()) return setErro("Descreva o motivo do encerramento.");
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}/encerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim(), force: !!force }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Quando ha pedido CRIADO no Omie, backend bloqueia e devolve
        // requiresForce. Oferece confirmar pra forcar.
        if (data.requiresForce) {
          setSalvando(false);
          const ok = window.confirm(
            `${data.error}\n\n` +
            `Confirma que voce JA cancelou o(s) pedido(s) no Omie?\n` +
            `Se sim, vou cancelar a RM no Workspace (so afeta nosso historico).`
          );
          if (ok) return submit(true);
          return;
        }
        throw new Error(data.error || "Erro");
      }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Encerrar RM" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        {itensPendentes.length > 0 && (
          <div className="bg-torg-orange-50 border border-torg-orange-200 rounded p-3 text-sm text-torg-orange-700 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <p>
              Existem <strong>{itensPendentes.length} ite{itensPendentes.length === 1 ? "m" : "ns"}</strong> ainda não comprados.
              Eles serão cancelados automaticamente com o motivo informado abaixo.
            </p>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Motivo do encerramento *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex: Cliente cancelou esse pacote; substituída pela RM-XXXX; etc."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Encerrar RM
        </button>
      </div>
    </Modal>
  );
}

// Modal de edicao das categorias da OP que essa RM cobre. Permite (des)marcar
// categorias de Material / Aluguel / Outro. Mudancas vao via PATCH na RM.
export function ModalEditarCategorias({ rm, onClose, onSaved }) {
  const [selecionadas, setSelecionadas] = useState(new Set(rm.categoriasOP || []));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const toggle = (codigo) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const salvar = async () => {
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "atualizar_categorias",
          categoriasOP: Array.from(selecionadas),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  const grupos = [
    { titulo: "Material", itens: CATEGORIAS_MATERIAL },
    { titulo: "Serviços Terceirizados", itens: CATEGORIAS_SERVICOS_TERCEIRIZADOS },
    { titulo: "Aluguel", itens: CATEGORIAS_ALUGUEL },
    { titulo: "Outro", itens: [CATEGORIA_OUTRO] },
  ];

  return (
    <Modal titulo="Editar categorias do escopo" onClose={onClose}>
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-torg-gray">
            Marque/desmarque as categorias que essa RM cobre.
          </p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-torg-gray font-medium">{selecionadas.size} marcadas</span>
            {selecionadas.size > 0 && (
              <button
                type="button"
                onClick={() => setSelecionadas(new Set())}
                className="text-torg-blue hover:text-torg-dark font-medium"
              >
                Limpar tudo
              </button>
            )}
          </div>
        </div>
        {grupos.map((g) => (
          <div key={g.titulo}>
            <p className="text-xs font-semibold text-torg-dark mb-1.5 uppercase tracking-wide">{g.titulo}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {g.itens.map((cat) => {
                const checked = selecionadas.has(cat.codigo);
                return (
                  <label
                    key={cat.codigo}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                      checked
                        ? "bg-torg-blue-50 border-torg-blue-200 text-torg-dark"
                        : "bg-white border-gray-200 text-torg-gray hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(cat.codigo)}
                      className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    <span className="flex-1">{cat.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={salvar}
          disabled={salvando}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}
