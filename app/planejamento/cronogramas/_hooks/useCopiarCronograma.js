"use client";
import { useState, useEffect } from "react";

// Copiar um cronograma inteiro pra outra OP. Junta os dez estados e os quatro
// passos do fluxo (abrir -> listar OPs -> escolher destino -> duplicar) que
// estavam soltos no meio do CronogramaDetail.
//
// ⚠ `isVitor` mora aqui porque a copia e restrita a ele por ora — e a mesma
// decisao, e some junto quando a restricao cair.
export function useCopiarCronograma({ cronogramaId, detail }) {
  const [showCopiar, setShowCopiar] = useState(false);
  const [copiarOp, setCopiarOp] = useState("");
  const [copiarTitulo, setCopiarTitulo] = useState("");
  const [copiarProgresso, setCopiarProgresso] = useState(true);
  const [copiando, setCopiando] = useState(false);
  const [copiarErro, setCopiarErro] = useState("");
  const [copiarOps, setCopiarOps] = useState([]);
  const [loadingCopiarOps, setLoadingCopiarOps] = useState(false);
  const [isVitor, setIsVitor] = useState(false); // copiar é restrito ao Vitor por ora

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => { if (vivo) setIsVitor((d?.user?.email || "").toLowerCase() === "vitor@torg.com.br"); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const abrirCopiar = () => {
    setCopiarOp("");
    setCopiarTitulo(detail.titulo || "");
    setCopiarProgresso(true);
    setCopiarErro("");
    setShowCopiar(true);
    setLoadingCopiarOps(true);
    fetch("/api/planejamento/cronogramas/manual")
      .then((r) => r.json())
      .then((d) => setCopiarOps(d.ops || []))
      .catch(() => setCopiarOps([]))
      .finally(() => setLoadingCopiarOps(false));
  };
  // Ao escolher a OP destino, sugere o título com a obra dela (editável).
  const selecionarOpCopia = (numero) => {
    setCopiarOp(numero);
    const op = copiarOps.find((o) => o.numero === numero);
    if (op) setCopiarTitulo(op.obra || op.cliente || detail.titulo || "");
  };
  const copiar = async () => {
    if (!copiarOp.trim() || !copiarTitulo.trim()) return;
    setCopiando(true);
    setCopiarErro("");
    try {
      const opNumeroFinal = copiarOp.toUpperCase().startsWith("T") ? copiarOp.toUpperCase() : `T${copiarOp}`;
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/duplicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: opNumeroFinal, titulo: copiarTitulo, manterProgresso: copiarProgresso }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao copiar cronograma");
      // vai direto pro cronograma novo
      window.location.href = `/planejamento/cronogramas/${data.id}`;
    } catch (e) {
      setCopiarErro(e.message);
      setCopiando(false);
    }
  };
  return {
    showCopiar, setShowCopiar, copiarOp, copiarTitulo, setCopiarTitulo,
    copiarProgresso, setCopiarProgresso, copiando, copiarErro, copiarOps,
    loadingCopiarOps, isVitor, abrirCopiar, selecionarOpCopia, copiar,
  };
}
