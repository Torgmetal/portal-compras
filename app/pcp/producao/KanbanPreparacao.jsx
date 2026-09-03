"use client";
// ─── O KANBAN DA PREPARAÇÃO, DENTRO DO PAINEL DO PCP ───────────────────────────
//
// Vitor (03/09/2026): "se eu estou na aba de preparação você precisa mostrar o kanban de
// preparação; se estou na página de montagem preciso que mostre a página de montagem". O bloco de
// baixo passou a seguir o setor escolhido lá em cima, em vez de mostrar sempre as bancadas.
//
// ⚠⚠ É O KANBAN DE VERDADE, não uma cópia. Reusa o mesmo FilaCorteClient de /pcp/fila-corte: uma
// segunda fila de corte, com outra régua de coluna, seria a fábrica olhando dois quadros que
// discordam sobre o que está em corte.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import FilaCorteClient from "@/app/pcp/fila-corte/FilaCorteClient";

export default function KanbanPreparacao() {
  const [pecas, setPecas] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/pcp/fila-corte", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!vivo) return; if (j?.error) setErro(j.error); setPecas(j?.pecas || []); })
      .catch((e) => { if (vivo) { setErro(e.message); setPecas([]); } });
    return () => { vivo = false; };
  }, []);

  if (!pecas) {
    return (
      <div className="bg-white rounded-xl border border-torg-blue-100 px-4 py-4 mb-4">
        <p className="text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> abrindo a fila da preparação…
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 px-4 py-4 mb-4">
      {erro && <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{erro}</p>}
      <FilaCorteClient pecasIniciais={pecas} />
    </div>
  );
}
