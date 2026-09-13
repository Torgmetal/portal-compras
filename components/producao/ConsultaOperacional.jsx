"use client";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, PackageOpen } from "lucide-react";
export const botao =
  "min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium bg-white text-torg-dark hover:bg-gray-50 disabled:opacity-40";
export const campo =
  "min-h-11 min-w-0 rounded-lg border border-gray-200 px-3 bg-white text-sm text-torg-dark";
export const fmt = (v, d = 0) =>
  Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });
export const data = (v) =>
  v
    ? new Date(
        String(v).length === 10 ? `${v}T12:00:00Z` : v,
      ).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Não informado";
export function useConsulta(url) {
  const [tentativa, setTentativa] = useState(0),
    [estado, setEstado] = useState({});
  useEffect(() => {
    if (!url) {
      setEstado({});
      return;
    }
    const abort = new AbortController();
    setEstado({ url, carregando: true });
    (async () => {
      try {
        const r = await fetch(url, { cache: "no-store", signal: abort.signal });
        const dados = await r.json();
        if (!r.ok) throw new Error(dados.error || "Falha na consulta.");
        if (!abort.signal.aborted) setEstado({ url, dados });
      } catch (e) {
        if (!abort.signal.aborted) setEstado({ url, erro: e.message });
      }
    })();
    return () => abort.abort();
  }, [url, tentativa]);
  // Não mostra nem permite agir nos dados de outra OP durante uma troca.
  return {
    ...(estado.url === url ? estado : url ? { carregando: true } : {}),
    recarregar: () => setTentativa((t) => t + 1),
    atualizar: (fn) => setEstado((e) => ({ ...e, dados: fn(e.dados) })),
  };
}
export function EstadoConsulta({ estado, children }) {
  if (estado.carregando)
    return (
      <div
        role="status"
        className="p-10 flex gap-3 justify-center text-torg-gray"
      >
        <Loader2 className="animate-spin shrink-0" />
        Consultando registros…
      </div>
    );
  if (estado.erro)
    return (
      <div role="alert" className="p-5 bg-red-50 text-red-700 rounded-xl">
        <p>{estado.erro}</p>
        <button className={`${botao} mt-3`} onClick={estado.recarregar}>
          Tentar novamente
        </button>
      </div>
    );
  return estado.dados ? children : null;
}
export function Vazio({ children }) {
  return (
    <div className="p-10 text-center text-torg-gray bg-white rounded-xl border">
      <PackageOpen className="mx-auto mb-3" />
      {children}
    </div>
  );
}
export function Atualizar({ onClick, disabled }) {
  return (
    <button
      className={`${botao} flex gap-2 items-center`}
      disabled={disabled}
      onClick={onClick}
    >
      <RefreshCw size={16} />
      Atualizar
    </button>
  );
}
