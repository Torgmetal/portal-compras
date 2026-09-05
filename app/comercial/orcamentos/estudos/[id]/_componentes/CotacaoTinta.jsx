"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { perdaDaEstrutura } from "@/lib/lqc";
import { fmtR$, num } from "../_lib/formatos";

// ─── COTAÇÃO DE TINTA COM OS FABRICANTES ──────────────────────────────────────────────────────
// Vitor (31/08/2026): "precisamos que tenha o botão para enviar para cotação (…) mando a
// especificação da pintura, mais a área a ser pintada e o coeficiente de perda para o fabricante e
// com base nisso ele informa quantos galões, quantos diluentes e componentes B vai precisar vender"
// e "traga os cadastrados no vendor list, página de compras, lista de fornecedores de tintas".
//
// ⚠⚠ NADA SAI PARA QUEM NÃO FOI MARCADO. Vitor: "precisa ser selecionado quais fornecedores vamos
// enviar, não deve mandar nada para ninguém que não esteja selecionado". Por isso não existe
// "enviar para todos" nem pré-seleção: a caixa começa vazia e o botão só liga com alguém marcado.
//
// ⚠ ESTA NÃO É A COTAÇÃO DO COMPRAS. Lá nasce de uma RM, com OP aberta; aqui a obra ainda não foi
// vendida. O e-mail diz isso com todas as letras ("ainda não é um pedido de compra") — se o
// fornecedor confundir os dois, ele reserva estoque para uma obra que talvez não exista.
export function CotacaoTinta({ estudoId, c, res }) {
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(() => {
    if (!estudoId) return;
    fetch(`/api/comercial/estudos/cotacao?tipo=TINTA&estudoId=${estudoId}`)
      .then((r) => r.json()).then((j) => !j.error && setDados(j)).catch(() => {});
  }, [estudoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const camadas = (Array.isArray(c.tintas) ? c.tintas : [])
    .filter((t) => t.produto || t.solidos || t.peliculaSeca)
    .map((t) => ({ camada: t.camada, produto: t.produto, peliculaSeca: t.peliculaSeca, solidos: t.solidos, cor: t.cor }));
  // ⚠ a perda que vai na consulta é a que PREDOMINA no levantamento: mandar 45% quando metade da
  // obra é guarda-corpo faria o fabricante dimensionar tinta a menos.
  const perdas = (Array.isArray(c.resumos) ? c.resumos : []).filter((l) => l.ativo !== false)
    .map((l) => perdaDaEstrutura(l.estrutura));
  const perda = perdas.length ? Math.max(...perdas) : 45;
  const areaM2 = Math.round(num(res?.areaM2) || 0);
  const pronto = areaM2 > 0 && camadas.length > 0;

  const alterna = (id) => setMarcados((s2) => { const n = new Set(s2); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function marcarVencedor(id) {
    try {
      const r = await fetch("/api/comercial/estudos/cotacao/vencedor", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fornecedorId: id }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro");
      carregar();
    } catch (e) { setAviso(e.message); }
  }

  async function enviar() {
    if (!marcados.size) return;
    if (!confirm(
      `Enviar a consulta de tintas para ${marcados.size} fabricante(s)?\n\n` +
      `Vai a área (${areaM2.toLocaleString("pt-BR")} m²), o coeficiente de perda (${perda}%) e o esquema de ` +
      `${camadas.length} demão(ões). Não vai preço nosso nem nome de concorrente.`
    )) return;
    setEnviando(true); setAviso("");
    try {
      const r = await fetch("/api/comercial/estudos/cotacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estudoId, tipo: "TINTA", fornecedorIds: [...marcados],
          snapshot: { areaM2, perda, perdaNota: perda === 85 ? "guarda-corpo / escada marinheiro" : null,
                      camadas, fabricante: c.pinturaFabricante || null },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setAviso(`Consulta enviada a ${j.enviados} de ${j.convidados} fabricante(s).`);
      setMarcados(new Set());
      carregar();
    } catch (e) { setAviso("Falha: " + e.message); } finally { setEnviando(false); }
  }

  if (!dados) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-torg-dark">Cotação com os fabricantes de tinta</p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Manda área, coeficiente de perda e o esquema de pintura — o fabricante devolve galões,
            diluente e componente B. Fase de orçamento: não é pedido de compra.
          </p>
        </div>
        <button onClick={enviar} disabled={!marcados.size || enviando || !pronto}
          title={!pronto ? "Lance a área e o esquema de pintura antes de consultar" : marcados.size ? "" : "Marque quem deve receber"}
          className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-2 hover:bg-torg-dark disabled:opacity-40 inline-flex items-center gap-1.5">
          {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Enviar para cotação{marcados.size ? ` (${marcados.size})` : ""}
        </button>
      </div>

      {!pronto && (
        <p className="mt-2 text-[11px] text-torg-orange-700">
          Falta {areaM2 > 0 ? "o esquema de pintura (camadas)" : "a área a pintar"} — sem isso o fabricante não tem como dimensionar.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {dados.fornecedores.map((f) => (
          <label key={f.id}
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] cursor-pointer ${
              marcados.has(f.id) ? "border-torg-blue bg-torg-blue-50 text-torg-dark" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
            <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alterna(f.id)}
              className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            <span className="font-medium text-torg-dark">{f.nome}</span>
            {f.praca && <span className="text-[10px] text-torg-gray">{f.praca}</span>}
          </label>
        ))}
        {!dados.fornecedores.length && (
          <p className="text-[11px] text-torg-orange-700">
            Nenhum fornecedor com família “Tinta” e e-mail no vendor list.
          </p>
        )}
      </div>

      {aviso && <p className="mt-2 text-[11px] text-torg-dark">{aviso}</p>}

      {/* ─── MAPA DE COTAÇÕES ───────────────────────────────────────────────────────────────────
          Vitor (31/08/2026): "precisamos ter o mapa de cotações (…) para podermos ver quem foi o
          vencedor".

          ⚠ ORDENADO PELO MENOR TOTAL, com quem ainda não respondeu no fim: o mapa existe para
          comparar, e quem não respondeu não é comparável — deixar no meio faria a leitura parecer
          uma classificação quando não é.

          ⚠⚠ MARCAR O VENCEDOR NÃO AVISA NINGUÉM. A obra nem foi vendida, e o fabricante saber que
          "venceu" um orçamento cria expectativa de pedido que pode nunca vir. É decisão interna. */}
      {dados.cotacoes.map((ct) => (
        <div key={ct.id} className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-torg-gray mb-1.5">
            Mapa · consulta de {new Date(ct.enviadoEm).toLocaleDateString("pt-BR")}
            {ct.enviadoPorNome ? ` · ${ct.enviadoPorNome}` : ""}
            {ct.snapshot?.areaM2 ? ` · ${Number(ct.snapshot.areaM2).toLocaleString("pt-BR")} m² · perda ${ct.snapshot.perda}%` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead className="text-[10px] uppercase text-torg-gray">
                <tr>
                  <th className="text-left py-1">Fabricante</th>
                  <th className="text-left py-1">Situação</th>
                  <th className="text-right py-1">Galões</th>
                  <th className="text-right py-1">Total</th>
                  <th className="text-left py-1 pl-3">Prazo</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ct.fornecedores.map((f) => {
                  const r = f.resposta;
                  const galoes = (r?.camadas || []).reduce((s2, c2) => s2 + (Number(c2.galoes) || 0), 0);
                  return (
                    <tr key={f.id} className={f.vencedor ? "bg-emerald-50/60" : undefined}>
                      <td className="py-1.5 font-medium text-torg-dark">{f.nome}</td>
                      <td className="py-1.5">
                        {f.erroEnvio
                          ? <span className="text-red-600" title={f.erroEnvio}>e-mail falhou</span>
                          : f.respondidoEm
                            ? <span className="text-emerald-700">respondeu {new Date(f.respondidoEm).toLocaleDateString("pt-BR")}</span>
                            : <span className="text-torg-gray">aguardando</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{galoes || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold text-torg-dark">
                        {f.valorTotal > 0 ? fmtR$(f.valorTotal) : "—"}
                      </td>
                      <td className="py-1.5 pl-3">{r?.prazo || "—"}</td>
                      <td className="py-1.5 text-right">
                        {f.valorTotal > 0 && (
                          <button onClick={() => marcarVencedor(f.id)}
                            className={`text-[11px] font-semibold rounded px-2 py-0.5 ${
                              f.vencedor ? "bg-emerald-600 text-white" : "text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50"}`}>
                            {f.vencedor ? "vencedor" : "marcar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ct.fornecedores.some((f) => f.resposta?.observacao) && (
            <div className="mt-1.5 space-y-0.5">
              {ct.fornecedores.filter((f) => f.resposta?.observacao).map((f) => (
                <p key={f.id} className="text-[11px] text-torg-gray"><strong>{f.nome}:</strong> {f.resposta.observacao}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
