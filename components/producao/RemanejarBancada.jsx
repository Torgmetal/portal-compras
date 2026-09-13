"use client";
import { useState } from "react";
import { BANCADAS_CONSULTA_MONTAGEM, rotuloPosto } from "@/lib/postos-operador";
import { useStore } from "@/lib/store";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { botao, campo, fmt, data } from "./ConsultaOperacional";

export default function RemanejarBancada({ trabalho, hoje, onClose, onSalvo }) {
  const [recurso, setRecurso] = useState(trabalho.recurso);
  const [dia, setDia] = useState(trabalho.dia > hoje ? trabalho.dia : hoje);
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const { showToast } = useStore();
  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/producao/fila/remanejar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recurso,
          dia,
          fracoes: trabalho.itens.flatMap((i) => i.faixas),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível remanejar.");
      onSalvo(recurso, dia);
      showToast("Bancada e Gantt atualizados.", "success");
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
      setConfirmar(false);
    }
  }
  return (
    <section
      aria-label="Remanejar lote"
      className="mt-4 border border-torg-blue rounded-lg p-3 bg-blue-50 space-y-3"
    >
      <h4 className="font-semibold text-torg-dark">
        Remanejar OP {trabalho.op}
      </h4>
      <p className="text-sm text-torg-gray">
        {fmt(trabalho.saldo)} peças restantes. A mudança será salva também no
        Gantt.
      </p>
      <label className="block text-sm text-torg-dark">
        Bancada de destino
        <select
          aria-label="Bancada de destino"
          value={recurso}
          onChange={(e) => setRecurso(e.target.value)}
          className={`${campo} w-full mt-1`}
          disabled={salvando}
        >
          {BANCADAS_CONSULTA_MONTAGEM.map((r) => (
            <option key={r} value={r}>
              {rotuloPosto(r)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-torg-dark">
        Data programada
        <input
          aria-label="Data programada"
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className={`${campo} block w-full mt-1`}
          disabled={salvando}
        />
      </label>
      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={`${botao} !bg-torg-blue !text-white`}
          disabled={salvando || !dia || !recurso}
          onClick={() => setConfirmar(true)}
        >
          Conferir troca
        </button>
        <button className={botao} disabled={salvando} onClick={onClose}>
          Cancelar
        </button>
      </div>
      <ConfirmModal
        open={confirmar}
        titulo="Confirmar remanejamento"
        mensagem={`OP ${trabalho.op} · ${fmt(trabalho.saldo)} peças pendentes\nDe: ${rotuloPosto(trabalho.recurso)}\nPara: ${rotuloPosto(recurso)}\nData: ${data(dia)}\n\nO Gantt será atualizado. O que já foi produzido permanece no histórico.`}
        labelConfirmar="Salvar no Gantt"
        variant="padrao"
        loading={salvando}
        onClose={() => setConfirmar(false)}
        onConfirm={salvar}
      />
    </section>
  );
}
