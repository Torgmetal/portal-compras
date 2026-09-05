"use client";
import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { FAMILIAS_COTACAO } from "@/lib/cotacao-familias";
import { fmtR$, num } from "../_lib/formatos";

// ─── COTAR UMA FAMÍLIA DE ITENS COMERCIAIS ────────────────────────────────────────────────────
// Vitor (01/09/2026): "trazer o botão de cotação nesses itens também, grade de piso e demais que
// estiverem lá, seria bom vc trazer separado para não cometermos erro de enviar para cotação".
//
// ⚠⚠ O BOTÃO É DO GRUPO, e é isso que impede o erro. Um botão único no rodapé da tabela mandaria
// tudo para todos; aqui cada família só enxerga os itens dela e só os fornecedores dela. Telha não
// tem como sair para quem vende parafuso.
//
// ⚠ SÓ ENTRA ITEM COM QUANTIDADE. Mandar "Rufos — 0 m" para o fornecedor é pedir preço de nada, e
// ele responde perguntando o que é. O botão desliga quando o grupo inteiro está zerado.
export function BotaoCotarFamilia({ familia, estudoId, itens, it, areas }) {
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [abrir, setAbrir] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(() => {
    if (!estudoId) return;
    fetch(`/api/comercial/estudos/cotacao?tipo=${familia}&estudoId=${estudoId}`)
      .then((r) => r.json()).then((j) => !j.error && setDados(j)).catch(() => {});
  }, [estudoId, familia]);
  useEffect(() => { if (abrir) carregar(); }, [abrir, carregar]);

  // quantidade do item: soma por área quando existir, senão o número solto
  const qtdDe = (k) => {
    const cfg = it[k] || {};
    const pa = cfg.porArea || {};
    const soma = (areas || []).reduce((a, ar) => a + num(pa[ar]), 0);
    return soma > 0 ? soma : num(cfg.qtd);
  };
  const lista = itens.map((i) => ({ key: i.key, descricao: i.rotulo, unidade: i.un, qtd: qtdDe(i.key), peso: null,
                                    norma: null, bitola: (it[i.key] || {}).cor || null }))
    .filter((i) => i.qtd > 0);

  async function enviar() {
    if (!marcados.size || !lista.length) return;
    if (!confirm(`Enviar ${lista.length} item(ns) de ${FAMILIAS_COTACAO[familia]?.rotulo} para ${marcados.size} fornecedor(es)?`)) return;
    setEnviando(true); setAviso("");
    try {
      const r = await fetch("/api/comercial/estudos/cotacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estudoId, tipo: familia, fornecedorIds: [...marcados], snapshot: { itens: lista, pesoKg: 0 } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setAviso(`Enviado a ${j.enviados} de ${j.convidados}.`);
      setMarcados(new Set()); carregar();
    } catch (e) { setAviso("Falha: " + e.message); } finally { setEnviando(false); }
  }

  const alterna = (id) => setMarcados((s2) => { const n = new Set(s2); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!abrir) {
    return (
      <button onClick={() => setAbrir(true)} disabled={!lista.length}
        title={lista.length ? "Escolher fornecedores e enviar" : "Nenhum item deste grupo tem quantidade lançada"}
        className="text-[11px] font-semibold text-torg-blue border border-torg-blue-200 rounded px-2 py-1 hover:bg-torg-blue-50 disabled:opacity-40 inline-flex items-center gap-1">
        <Send size={11} /> Cotar{lista.length ? ` (${lista.length})` : ""}
      </button>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {(dados?.fornecedores || []).map((f) => (
          <label key={f.id}
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] cursor-pointer ${
              marcados.has(f.id) ? "border-torg-blue bg-torg-blue-50 text-torg-dark" : "border-gray-200 text-torg-gray"}`}>
            <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alterna(f.id)}
              className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            {f.nome}
          </label>
        ))}
        {dados && !dados.fornecedores.length && (
          <span className="text-[11px] text-torg-orange-700">
            Nenhum fornecedor cadastrado nesta família no vendor list.
          </span>
        )}
        <button onClick={enviar} disabled={!marcados.size || enviando}
          className="text-[11px] font-semibold text-white bg-torg-blue rounded px-2 py-1 hover:bg-torg-dark disabled:opacity-40">
          {enviando ? "Enviando…" : `Enviar${marcados.size ? ` (${marcados.size})` : ""}`}
        </button>
        <button onClick={() => setAbrir(false)} className="text-[11px] text-torg-gray hover:text-torg-dark">fechar</button>
      </div>
      {aviso && <p className="mt-1 text-[11px] text-torg-dark">{aviso}</p>}
      {(dados?.cotacoes || []).map((ct) => (
        <p key={ct.id} className="mt-1 text-[11px] text-torg-gray">
          {new Date(ct.enviadoEm).toLocaleDateString("pt-BR")}:{" "}
          {ct.fornecedores.map((f) => (
            <span key={f.id} className={`mr-2 ${f.respondidoEm ? "text-emerald-700" : ""}`}>
              {f.nome}{f.valorTotal > 0 ? ` ${fmtR$(f.valorTotal)}` : f.respondidoEm ? " ✓" : ""}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
