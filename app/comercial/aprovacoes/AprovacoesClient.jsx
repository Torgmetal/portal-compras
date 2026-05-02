"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, X, AlertCircle } from "lucide-react";

const fmtMoeda = (v) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => new Date(d).toLocaleDateString("pt-BR");

export default function AprovacoesClient({ items }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState(null);
  const [erro, setErro] = useState("");

  const decidir = async (id, decisao) => {
    let observacao = "";
    if (decisao === "REJEITADA") {
      observacao = window.prompt("Motivo da rejeição (opcional):") || "";
    }
    setLoadingId(id);
    setErro("");
    try {
      const res = await fetch(`/api/comercial/solicitacao-verba/${id}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, observacao }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" /> <span>{erro}</span>
        </div>
      )}
      {items.map((it) => {
        const delta = it.valorProposto - it.valorAtual;
        const aumento = delta > 0;
        return (
          <div key={it.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Link href={`/comercial/${it.opId}`} className="text-xs font-mono font-semibold text-torg-blue hover:underline">
                    OP {it.opNumero}
                  </Link>
                  <span className="text-xs text-torg-gray">— {it.cliente}</span>
                  {it.aditivoNumero && (
                    <span className="text-xs bg-torg-orange-50 text-torg-orange-700 px-2 py-0.5 rounded-full">
                      Aditivo {it.aditivoNumero}
                    </span>
                  )}
                </div>
                <p className="text-torg-dark font-medium">{it.itemDescricao}</p>
                <p className="text-xs text-torg-gray mt-0.5">
                  Solicitado por {it.createdBy} em {fmtData(it.createdAt)}
                </p>

                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-torg-gray">Atual</p>
                    <p className="text-torg-dark font-medium tabular-nums">{fmtMoeda(it.valorAtual)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-torg-gray">Proposto</p>
                    <p className="text-torg-dark font-bold tabular-nums">{fmtMoeda(it.valorProposto)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-torg-gray">Variação</p>
                    <p className={`font-semibold tabular-nums ${aumento ? "text-red-600" : "text-torg-orange-700"}`}>
                      {aumento ? "+" : ""}{fmtMoeda(delta)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 bg-torg-blue-50/50 border border-torg-blue-100 rounded p-3">
                  <p className="text-xs text-torg-gray mb-1">Justificativa</p>
                  <p className="text-sm text-torg-dark">{it.justificativa}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 min-w-[140px]">
                <button
                  onClick={() => decidir(it.id, "APROVADA")}
                  disabled={loadingId === it.id}
                  className="px-4 py-2 bg-torg-orange text-white text-sm font-medium rounded-lg hover:bg-torg-orange-600 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loadingId === it.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Aprovar
                </button>
                <button
                  onClick={() => decidir(it.id, "REJEITADA")}
                  disabled={loadingId === it.id}
                  className="px-4 py-2 bg-white border border-gray-300 text-torg-gray text-sm font-medium rounded-lg hover:bg-gray-50 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <X size={14} /> Rejeitar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
