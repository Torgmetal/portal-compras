"use client";
import { useState } from "react";
import { Package, Warehouse } from "lucide-react";
import EstoqueClient from "./EstoqueClient";
import EstoqueFisicoClient from "./EstoqueFisicoClient";

const TABS = [
  { id: "fisico", label: "Estoque Físico", icon: Warehouse, desc: "Matéria-prima no pátio (SharePoint)" },
  { id: "omie", label: "Catálogo Omie", icon: Package, desc: "Produtos sincronizados do ERP" },
];

export default function EstoquePageWrapper({ itensIniciais, configInicial, isAdmin }) {
  const [aba, setAba] = useState("fisico");

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
          Estoque
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Controle de estoque de matéria-prima e catálogo de produtos
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const ativo = aba === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setAba(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                ativo
                  ? "bg-white text-torg-dark shadow-sm"
                  : "text-torg-gray hover:text-torg-dark hover:bg-white/50"
              }`}
            >
              <Icon size={16} className={ativo ? "text-torg-blue" : ""} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {aba === "fisico" && <EstoqueFisicoClient />}
      {aba === "omie" && (
        <EstoqueClient itensIniciais={itensIniciais} configInicial={configInicial} isAdmin={isAdmin} />
      )}
    </div>
  );
}
