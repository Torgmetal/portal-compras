"use client";
import { useState } from "react";
import { ClipboardList, ScrollText } from "lucide-react";
import CmrLancarClient from "@/app/compras/recebimento-cmr/CmrLancarClient";
import QualidadeClient from "../QualidadeClient";

// ─── CMR NO PORTAL DA QUALIDADE ───────────────────────────────────────────────────────────────
// Vitor (30/08/2026): "precisamos tirar a Rastreabilidade do portal da Qualidade (…) o ideal seria
// tirar essa de Rastreabilidade e trazer um espelho dessa Recebimentos CMR, pois essa nova ficou
// muito boa".
//
// ⚠ É O MESMO COMPONENTE, não uma cópia. `CmrLancarClient` vem de /compras/recebimento-cmr. Uma
// segunda planilha de CMR seria a pior coisa possível aqui: duas telas do mesmo dado divergem em
// semanas, e a Qualidade é justamente quem precisa que o número bata com o do Almoxarifado.
//
// ⚠⚠ A ABA "CONCILIAR" NÃO VEM JUNTO, de propósito. Lá o botão dá BAIXA nos itens da RM — é ação
// do Compras sobre o pedido, não leitura de rastreabilidade. Espelhar a planilha é uma coisa;
// deixar outro setor fechar item de compra é outra.
//
// A conferência de certificados (o painel que a Vitor pediu em 22/08, com as tratativas de
// situação) continua aqui, na segunda aba: sai da barra lateral, não do portal.
export default function CmrQualidadeClient() {
  const [aba, setAba] = useState("recebimentos");
  const Tab = ({ id, icon: Icon, children }) => (
    <button
      onClick={() => setAba(id)}
      className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${
        aba === id ? "bg-torg-blue text-white" : "text-torg-dark hover:bg-gray-50"
      }`}
    >
      <Icon size={15} /> {children}
    </button>
  );

  return (
    <div>
      <div className="px-6 pt-5">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
          <Tab id="recebimentos" icon={ClipboardList}>Recebimentos (CMR)</Tab>
          <Tab id="certificados" icon={ScrollText}>Certificados</Tab>
        </div>
      </div>
      {aba === "recebimentos" ? <CmrLancarClient /> : <QualidadeClient escopo="material" />}
    </div>
  );
}
