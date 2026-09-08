"use client";
import { useCallback, useEffect, useState } from "react";
import { lerJson } from "@/lib/ler-json";

// O estado da conferência aberta, separado da tela.
//
// ⚠⚠ TODA GRAVAÇÃO DEVOLVE O ESTADO INTEIRO, e é de propósito. Lançar e apagar respondem com
// marcas, saldos, lançamentos e progresso já recalculados no servidor. A alternativa — o navegador
// somar sozinho o que acabou de mandar — erra assim que outra pessoa lança na mesma obra, e erra
// silenciosamente: o celular mostraria saldo onde não há.

export function useSessao(id) {
  const url = `/api/expedicao/conferencia/${id}`;
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(null);
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try { setDados(await lerJson(await fetch(url, { cache: "no-store" }), "Conferência")); }
    catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [url]);
  useEffect(() => { carregar(); }, [carregar]);

  const lancar = useCallback(async ({ marca, qte, observacao }) => {
    setSalvando(true); setErro(""); setOk("");
    try {
      setDados(await lerJson(await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca, qte, observacao }),
      }), "Lançamento"));
      setOk(`${qte} × ${String(marca).toUpperCase()} conferida(s).`);
      return true;
    } catch (e) { setErro(e.message); return false; } finally { setSalvando(false); }
  }, [url]);

  const apagar = useCallback(async (itemId) => {
    setApagando(itemId); setErro(""); setOk("");
    try {
      setDados(await lerJson(
        await fetch(`${url}?item=${encodeURIComponent(itemId)}`, { method: "DELETE" }), "Apagar"));
    } catch (e) { setErro(e.message); } finally { setApagando(null); }
  }, [url]);

  const encerrar = useCallback(async (acao) => {
    setAgindo(true); setErro(""); setOk("");
    try {
      await lerJson(await fetch(url, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }),
      }), "Encerrar");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }, [url, carregar]);

  return {
    dados, carregando, salvando, apagando, agindo, erro, ok,
    limparErro: () => setErro(""),
    lancar, apagar, encerrar,
    encerrada: !!dados && dados?.conferencia?.status !== "ABERTA",
    marcas: dados?.marcas || [],
    lancamentos: dados?.lancamentos || [],
  };
}
