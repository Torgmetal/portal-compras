"use client";
// ─── ATUALIZAR AS REGRAS DE IBS/CBS A PARTIR DAS NFs ─────────────────────────
//
// Reconstrói `FiscalRegraIbsCbs` com as NF-e de saída do ano (POST /api/fiscal/inteligencia/
// regras-ibs-cbs — o mesmo que o cron faz toda madrugada). Serve para quem acabou de emitir uma nota
// com NCM/CFOP novo e não quer esperar o dia seguinte. ⚠ Leva até alguns minutos: o Omie é lido mês a
// mês, com espera quando ele estrangula por consumo.
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

export default function AtualizarRegrasNf() {
  const [estado, setEstado] = useState({ carregando: false, ok: null, erro: null });

  const atualizar = async () => {
    setEstado({ carregando: true, ok: null, erro: null });
    try {
      const resp = await fetch("/api/fiscal/inteligencia/regras-ibs-cbs", { method: "POST" });
      let d;
      try { d = await resp.json(); } catch { throw new Error(`Erro ${resp.status} do servidor. Tente de novo em instantes.`); }
      if (!resp.ok || !d.success) throw new Error(d.error || `Erro ${resp.status} do servidor.`);
      setEstado({ carregando: false, ok: d, erro: null });
    } catch (e) {
      setEstado({ carregando: false, ok: null, erro: e.message || "Falha de rede." });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-torg-gray">
      <span>CBS e IBS vêm das NF-e que emitimos no Omie, relidas toda madrugada.</span>
      <button type="button" onClick={atualizar} disabled={estado.carregando}
        className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-torg-dark hover:bg-gray-50 disabled:opacity-50">
        {estado.carregando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        {estado.carregando ? "Atualizando… (pode levar alguns minutos)" : "Atualizar regras das NFs"}
      </button>
      {estado.ok && (
        <span className="text-emerald-700">
          Atualizado: {estado.ok.notas} NF(s) lidas · {estado.ok.regras} regra(s).
        </span>
      )}
      {estado.erro && <span role="alert" className="text-red-600">Não atualizou: {estado.erro} As regras anteriores foram mantidas.</span>}
    </div>
  );
}
