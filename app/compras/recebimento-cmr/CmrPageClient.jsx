"use client";
import { useState } from "react";
import { ClipboardList, GitCompareArrows, History } from "lucide-react";
import CmrLancarClient from "./CmrLancarClient";
import RecebimentoCmrClient from "./RecebimentoCmrClient";
import CmrHistoricoClient from "./CmrHistoricoClient";

export default function CmrPageClient() {
  const [aba, setAba] = useState("lancar");
  return (
    <div>
      <div className="px-6 pt-5">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
          <button onClick={() => setAba("lancar")} className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${aba === "lancar" ? "bg-torg-blue text-white" : "text-torg-dark hover:bg-gray-50"}`}>
            <ClipboardList size={15} /> Lançar
          </button>
          <button onClick={() => setAba("conciliar")} className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${aba === "conciliar" ? "bg-torg-blue text-white" : "text-torg-dark hover:bg-gray-50"}`}>
            <GitCompareArrows size={15} /> Conciliar
          </button>
          <button onClick={() => setAba("historico")} className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${aba === "historico" ? "bg-torg-blue text-white" : "text-torg-dark hover:bg-gray-50"}`}>
            <History size={15} /> Histórico
          </button>
        </div>
      </div>
      {aba === "lancar" ? <CmrLancarClient /> : aba === "conciliar" ? <RecebimentoCmrClient /> : <CmrHistoricoClient />}
    </div>
  );
}
