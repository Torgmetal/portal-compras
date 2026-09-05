"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Upload } from "lucide-react";
import { fmtR$ } from "../_lib/formatos";

// ─── LISTA DE MATERIAL POR ITEM, E A COTAÇÃO DELA ─────────────────────────────────────────────
// Vitor (01/09/2026): "no caso do aço, quando tivermos uma lista específica por tipo do material
// seria interessante ter esse botão para podermos cotar também, pois isso é bem significativo para
// nós; quando é apenas usado peso na família do perfil fica mais difícil para comprarmos" — e
// (31/08) "vamos usar uma planilha igual a RM, deixe o campo para podermos importar e enviar para o
// fornecedor".
//
// ⚠ O QUADRO DE CIMA NÃO É COTÁVEL. "Perfil soldado · 235.565 kg · R$ 10,50" serve para orçar e não
// para comprar: ninguém cota 235 toneladas de uma família. A lista por bitola é o que o fornecedor
// consegue precificar, e é ela que vai no e-mail.
//
// ⚠⚠ A LISTA NÃO SUBSTITUI O QUANTITATIVO. Ela existe ao lado, para comprar; o peso que forma o
// preço continua vindo do quantitativo. Deixar a lista mandar no cálculo faria uma planilha de
// terceiro redefinir o custo da obra sem ninguém decidir isso.
export function ListaMaterialAco({ c, setComp, estudoId, res }) {
  const lista = Array.isArray(c.materialLista) ? c.materialLista : [];
  const [lendo, setLendo] = useState(false);
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const ref = useRef(null);

  const carregar = useCallback(() => {
    if (!estudoId) return;
    fetch(`/api/comercial/estudos/cotacao?tipo=ACO&estudoId=${estudoId}`)
      .then((r) => r.json()).then((j) => !j.error && setDados(j)).catch(() => {});
  }, [estudoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const pesoLista = lista.reduce((a, i) => a + (Number(i.peso) || 0), 0);

  async function importar(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setLendo(true); setAviso("");
    try {
      const [XLSX, { lerListaMaterial }] = await Promise.all([import("xlsx"), import("@/lib/parse-lista-material")]);
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grade = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false });
      const r = lerListaMaterial(grade);
      if (!r.itens.length) { alert(r.avisos.join("\n")); return; }
      const kg = r.itens.reduce((a, i) => a + (Number(i.peso) || 0), 0);
      if (!confirm(
        `Li ${r.itens.length} item(ns), ${Math.round(kg).toLocaleString("pt-BR")} kg.\n\n` +
        (r.avisos.length ? r.avisos.join("\n") + "\n\n" : "") + "Usar esta lista?"
      )) return;
      setComp({ materialLista: r.itens });
      setAviso(`${r.itens.length} item(ns) importados.`);
    } catch (e) { alert("Não consegui ler a planilha: " + e.message); } finally { setLendo(false); }
  }

  const alterna = (id) => setMarcados((s2) => { const n = new Set(s2); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function enviar() {
    if (!marcados.size || !lista.length) return;
    if (!confirm(`Enviar a lista (${lista.length} itens, ${Math.round(pesoLista).toLocaleString("pt-BR")} kg) para ${marcados.size} fornecedor(es)?`)) return;
    setEnviando(true); setAviso("");
    try {
      const r = await fetch("/api/comercial/estudos/cotacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estudoId, tipo: "ACO", fornecedorIds: [...marcados], snapshot: { itens: lista, pesoKg: pesoLista } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setAviso(`Lista enviada a ${j.enviados} de ${j.convidados} fornecedor(es).`);
      setMarcados(new Set());
      carregar();
    } catch (e) { setAviso("Falha: " + e.message); } finally { setEnviando(false); }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-torg-dark">Lista de material para cotar</p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Planilha no formato da RM (descrição, norma, quantidade, peso). É ela que vai ao
            fornecedor — o quadro por família abaixo serve para o preço, não para comprar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importar} />
          <button onClick={() => ref.current?.click()} disabled={lendo}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 rounded-lg px-3 py-2 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {lendo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {lista.length ? "Trocar lista" : "Importar lista"}
          </button>
          {lista.length > 0 && (
            <button onClick={enviar} disabled={!marcados.size || enviando}
              title={marcados.size ? "" : "Marque quem deve receber"}
              className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-2 hover:bg-torg-dark disabled:opacity-40 inline-flex items-center gap-1.5">
              {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Enviar para cotação{marcados.size ? ` (${marcados.size})` : ""}
            </button>
          )}
        </div>
      </div>

      {lista.length > 0 ? (
        <>
          <p className="mt-2 text-[11px] text-torg-dark">
            <strong>{lista.length}</strong> item(ns) · <strong>{Math.round(pesoLista).toLocaleString("pt-BR")} kg</strong>
            {res?.pesoTotal > 0 && Math.abs(pesoLista - res.pesoTotal) > res.pesoTotal * 0.02 && (
              <span className="text-torg-orange-700">
                {" "}— o quantitativo tem {Math.round(res.pesoTotal).toLocaleString("pt-BR")} kg; confira qual está certo.
              </span>
            )}
          </p>
          <div className="mt-2 max-h-52 overflow-auto border border-gray-100 rounded-lg">
            <table className="w-full text-[11.5px]">
              <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray sticky top-0">
                <tr><th className="text-left px-3 py-1">Descrição</th><th className="text-left px-2 py-1">Norma</th>
                  <th className="text-right px-2 py-1">Qtd</th><th className="text-right px-3 py-1">Peso</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.slice(0, 200).map((i, k) => (
                  <tr key={k}>
                    <td className="px-3 py-1">{i.descricao}{i.bitola ? <span className="text-torg-gray"> · {i.bitola}</span> : null}</td>
                    <td className="px-2 py-1 text-torg-gray">{i.norma || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{i.qtd ? `${Number(i.qtd).toLocaleString("pt-BR")}${i.unidade ? ` ${i.unidade}` : ""}` : "—"}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap">{i.peso ? `${Number(i.peso).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lista.length > 200 && <p className="mt-1 text-[10px] text-torg-gray">mostrando 200 de {lista.length} — a lista inteira vai na cotação.</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {(dados?.fornecedores || []).map((f) => (
              <label key={f.id}
                className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] cursor-pointer ${
                  marcados.has(f.id) ? "border-torg-blue bg-torg-blue-50 text-torg-dark" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
                <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alterna(f.id)}
                  className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                <span className="font-medium text-torg-dark">{f.nome}</span>
                {f.praca && <span className="text-[10px] text-torg-gray">{f.praca}</span>}
              </label>
            ))}
            {dados && !dados.fornecedores.length && (
              <p className="text-[11px] text-torg-orange-700">
                Nenhum fornecedor com família “Matéria Prima” e e-mail no vendor list.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-torg-gray">
          Sem lista importada — a cotação de aço fica indisponível. Com só o peso por família, o
          fornecedor não tem o que precificar.
        </p>
      )}

      {aviso && <p className="mt-2 text-[11px] text-torg-dark">{aviso}</p>}

      {(dados?.cotacoes || []).map((ct) => (
        <div key={ct.id} className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-torg-gray mb-1.5">
            Mapa · {new Date(ct.enviadoEm).toLocaleDateString("pt-BR")} · {(ct.snapshot?.itens || []).length} itens ·{" "}
            {Math.round(ct.snapshot?.pesoKg || 0).toLocaleString("pt-BR")} kg
          </p>
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase text-torg-gray">
              <tr><th className="text-left py-1">Fornecedor</th><th className="text-left py-1">Situação</th>
                <th className="text-right py-1">Total</th><th className="text-right py-1">R$/kg médio</th>
                <th className="text-left py-1 pl-3">Prazo</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ct.fornecedores.map((f) => (
                <tr key={f.id} className={f.vencedor ? "bg-emerald-50/60" : undefined}>
                  <td className="py-1.5 font-medium text-torg-dark">{f.nome}</td>
                  <td className="py-1.5">
                    {f.erroEnvio ? <span className="text-red-600">e-mail falhou</span>
                      : f.respondidoEm ? <span className="text-emerald-700">respondeu</span>
                      : <span className="text-torg-gray">aguardando</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{f.valorTotal > 0 ? fmtR$(f.valorTotal) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-torg-gray">
                    {f.valorTotal > 0 && ct.snapshot?.pesoKg > 0 ? fmtR$(f.valorTotal / ct.snapshot.pesoKg) : "—"}
                  </td>
                  <td className="py-1.5 pl-3">{f.resposta?.prazo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
