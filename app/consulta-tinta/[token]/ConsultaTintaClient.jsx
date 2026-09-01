"use client";
import { useState, useEffect } from "react";

// ─── O FABRICANTE RESPONDE AQUI ───────────────────────────────────────────────────────────────
// Vitor (31/08/2026): "precisa ser um portal totalmente separado do de compras e precisamos ter o
// mapa de cotações".
//
// ⚠⚠ NÃO PARECE O PORTAL DO COMPRAS, e isso é requisito e não estética. Lá o fornecedor responde
// uma RM — item cadastrado, OP aberta, pedido logo atrás. Aqui a obra ainda não foi vendida e o que
// se pede é dimensionamento. Duas telas iguais fariam o fabricante tratar orçamento como pedido:
// reservar estoque e cobrar a compra depois. O título, o texto e a rota dizem "consulta técnica".
//
// ⚠ A CONSULTA VEM DO SNAPSHOT, congelada no envio. Se a área mudar no estudo enquanto ele
// responde, a pergunta que ele está respondendo continua sendo a que recebeu.
const n = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ConsultaTintaClient({ token }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [f, setF] = useState({ contato: "", camadas: [], itens: [], diluenteLitros: "", diluentePreco: "", componenteBQtd: "", componenteBPreco: "", prazo: "", validade: "", observacao: "" });
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    fetch(`/api/consulta-tinta/${token}`).then((r) => r.json()).then((j) => {
      if (j.error) return setErro(j.error);
      setD(j);
      const base = (j.consulta?.camadas || []).map((c) => ({ camada: c.camada, produto: c.produto || "", galoes: "", litrosGalao: "", precoGalao: "" }));
      const baseItens = (j.consulta?.itens || []).map((i) => ({ descricao: i.descricao, precoKg: "", precoItem: "" }));
      const r = j.resposta;
      setF({
        contato: r?.contato || "",
        camadas: r?.camadas?.length ? r.camadas.map((c) => ({ ...c, galoes: c.galoes || "", litrosGalao: c.litrosGalao || "", precoGalao: c.precoGalao || "" })) : base,
        itens: r?.itens?.length ? r.itens.map((i) => ({ ...i, precoKg: i.precoKg || "", precoItem: i.precoItem || "" })) : baseItens,
        diluenteLitros: r?.diluente?.litros || "", diluentePreco: r?.diluente?.preco || "",
        componenteBQtd: r?.componenteB?.qtd || "", componenteBPreco: r?.componenteB?.preco || "",
        prazo: r?.prazo || "", validade: r?.validade || "", observacao: r?.observacao || "",
      });
      if (r) setPronto(true);
    }).catch(() => setErro("Não consegui abrir a consulta."));
  }, [token]);

  const setC = (i, k, v) => setF((p) => ({ ...p, camadas: p.camadas.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const setI = (i, k, v) => setF((p) => ({ ...p, itens: p.itens.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const pedidos = d?.consulta?.itens || [];
  // ⚠ o subtotal do item aceita os dois jeitos de cotar: R$/kg (o do mercado) ou preço fechado.
  const subItem = (i, k) => n(i.precoItem) > 0 ? n(i.precoItem) : n(i.precoKg) * (Number(pedidos[k]?.peso) || 0);
  const total = f.camadas.reduce((s, c) => s + n(c.galoes) * n(c.precoGalao), 0)
    + n(f.diluenteLitros) * n(f.diluentePreco) + n(f.componenteBQtd) * n(f.componenteBPreco)
    + f.itens.reduce((s, i, k) => s + subItem(i, k), 0);

  async function enviar(e) {
    e.preventDefault();
    if (f.contato.trim().length < 2) return setErro("Informe seu nome para registrarmos a proposta.");
    setEnviando(true); setErro("");
    try {
      const r = await fetch(`/api/consulta-tinta/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setPronto(true);
    } catch (e2) { setErro(e2.message); } finally { setEnviando(false); }
  }

  if (erro && !d) return <Moldura><p className="text-red-600 text-sm">{erro}</p></Moldura>;
  if (!d) return <Moldura><p className="text-sm text-gray-500">Carregando…</p></Moldura>;

  const c = d.consulta || {};
  // ⚠ UM PORTAL, DOIS ASSUNTOS. O tipo decide o que a tela pede — tinta pergunta galões por demão,
  // aço pergunta R$/kg por item. Duas telas separadas duplicariam token, histórico e o aviso de
  // "isto é orçamento", que é a parte que não pode divergir.
  const aco = d.tipo === "ACO";
  return (
    <Moldura>
      <p className="text-[13px] text-gray-600">Olá, <strong className="text-[#0D1F3C]">{d.fornecedor}</strong>.</p>
      <h1 className="mt-1 text-[22px] font-bold text-[#0D1F3C]">
        {aco ? "Consulta de material — aço" : "Consulta técnica de tintas"}
      </h1>
      <p className="mt-1 text-[13px] text-gray-600">
        Estamos <strong>orçando</strong> a obra {d.obra}. Ainda não é um pedido de compra — precisamos
        {aco ? " do seu preço" : " do seu dimensionamento"} para fechar o orçamento.
      </p>

      <div className="mt-5 rounded-xl border border-gray-200 overflow-hidden">
        <p className="px-4 py-2 bg-[#0D1F3C] text-white text-[12px] font-semibold">
          {aco ? "Material da obra" : "O que precisa ser pintado"}
        </p>
        <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
          {aco ? (
            <>
              <div><span className="block text-[11px] text-gray-500">Peso total</span><strong>{Number(c.pesoKg || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</strong></div>
              <div><span className="block text-[11px] text-gray-500">Itens na lista</span><strong>{(c.itens || []).length}</strong></div>
            </>
          ) : (
            <>
              <div><span className="block text-[11px] text-gray-500">Área total</span><strong>{Number(c.areaM2 || 0).toLocaleString("pt-BR")} m²</strong></div>
              <div><span className="block text-[11px] text-gray-500">Coeficiente de perda</span><strong>{c.perda ?? 45}%</strong></div>
              {c.fabricante && <div><span className="block text-[11px] text-gray-500">Especificação do cliente</span><strong>{c.fabricante}</strong></div>}
            </>
          )}
        </div>
        {aco && (c.itens || []).length > 0 && (
          <div className="max-h-64 overflow-auto border-t border-gray-100">
            <table className="w-full text-[12.5px]">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 sticky top-0">
                <tr><th className="text-left px-4 py-1.5">Descrição</th><th className="text-left px-2 py-1.5">Norma</th>
                  <th className="text-right px-2 py-1.5">Qtd</th><th className="text-right px-4 py-1.5">Peso</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {c.itens.map((i, k) => (
                  <tr key={k}>
                    <td className="px-4 py-1.5">{i.descricao}{i.bitola ? <span className="block text-[11px] text-gray-500">{i.bitola}</span> : null}</td>
                    <td className="px-2 py-1.5">{i.norma || "—"}</td>
                    <td className="px-2 py-1.5 text-right">{i.qtd ? `${Number(i.qtd).toLocaleString("pt-BR")}${i.unidade ? ` ${i.unidade}` : ""}` : "—"}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{i.peso ? `${Number(i.peso).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!aco && (c.camadas || []).length > 0 && (
          <table className="w-full text-[12.5px] border-t border-gray-100">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
              <tr><th className="text-left px-4 py-1.5">Demão</th><th className="text-left px-2 py-1.5">Produto / resina</th>
                <th className="text-right px-2 py-1.5">Película</th><th className="text-right px-2 py-1.5">Sólidos</th>
                <th className="text-left px-4 py-1.5">Cor</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {c.camadas.map((x, i) => (
                <tr key={i}>
                  <td className="px-4 py-1.5 font-semibold text-[#0D1F3C]">{x.camada}</td>
                  <td className="px-2 py-1.5">{x.produto || "—"}</td>
                  <td className="px-2 py-1.5 text-right">{x.peliculaSeca ?? "—"} µm</td>
                  <td className="px-2 py-1.5 text-right">{x.solidos ?? "—"}%</td>
                  <td className="px-4 py-1.5">{x.cor || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pronto ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <p className="text-[14px] font-semibold text-emerald-900">Proposta recebida — obrigado.</p>
          <p className="mt-1 text-[13px] text-emerald-800">
            Total informado: <strong>{brl(total)}</strong>. Se precisar corrigir algo, é só editar
            abaixo e enviar de novo — vale sempre a última.
          </p>
          <button onClick={() => setPronto(false)} className="mt-2 text-[13px] font-semibold text-[#006EAB] hover:underline">
            Editar minha proposta
          </button>
        </div>
      ) : (
        <form onSubmit={enviar} className="mt-5 space-y-4">
          {aco ? (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <p className="px-4 py-2 bg-gray-50 text-[12px] font-semibold text-[#0D1F3C]">
                Seu preço para cada item
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] min-w-[620px]">
                  <thead className="bg-white text-[10px] uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-1.5">Item</th>
                      <th className="text-right px-2 py-1.5">Qtd</th>
                      <th className="text-right px-2 py-1.5">Peso</th>
                      <th className="text-right px-2 py-1.5 w-28">R$/kg</th>
                      <th className="text-right px-2 py-1.5 w-32">ou preço fechado</th>
                      <th className="text-right px-3 py-1.5">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {f.itens.map((it, k) => {
                      const ped = pedidos[k] || {};
                      return (
                        <tr key={k}>
                          <td className="px-3 py-1.5">
                            <span className="block text-[#0D1F3C]">{ped.descricao || it.descricao}</span>
                            {(ped.bitola || ped.norma) && (
                              <span className="block text-[11px] text-gray-500">{[ped.bitola, ped.norma].filter(Boolean).join(" · ")}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">{ped.qtd ? `${Number(ped.qtd).toLocaleString("pt-BR")}${ped.unidade ? ` ${ped.unidade}` : ""}` : "—"}</td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">{ped.peso ? `${Number(ped.peso).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—"}</td>
                          <td className="px-2 py-1.5">
                            <input value={it.precoKg ?? ""} onChange={(e) => setI(k, "precoKg", e.target.value)}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-right text-[12.5px] focus:border-[#006EAB] focus:outline-none" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={it.precoItem ?? ""} onChange={(e) => setI(k, "precoItem", e.target.value)}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-right text-[12.5px] focus:border-[#006EAB] focus:outline-none" />
                          </td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">
                            {subItem(it, k) > 0 ? brl(subItem(it, k)) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-3 py-2 text-[11px] text-gray-500 border-t border-gray-100">
                Informe o R$/kg <em>ou</em> o preço fechado do item — o que for mais prático. Se
                preencher os dois, vale o preço fechado.
              </p>
            </div>
          ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <p className="px-4 py-2 bg-gray-50 text-[12px] font-semibold text-[#0D1F3C]">
              Quantos galões atendem esta área?
            </p>
            <div className="divide-y divide-gray-100">
              {f.camadas.map((cam, i) => (
                <div key={i} className="px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#0D1F3C]">{cam.camada}</p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Campo r="Produto ofertado" v={cam.produto} on={(v) => setC(i, "produto", v)} full />
                    <Campo r="Galões" v={cam.galoes} on={(v) => setC(i, "galoes", v)} dir />
                    <Campo r="Litros/galão" v={cam.litrosGalao} on={(v) => setC(i, "litrosGalao", v)} dir />
                    <Campo r="R$ por galão" v={cam.precoGalao} on={(v) => setC(i, "precoGalao", v)} dir />
                  </div>
                  {n(cam.galoes) > 0 && n(cam.precoGalao) > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">Subtotal {brl(n(cam.galoes) * n(cam.precoGalao))}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Campo r="Diluente (litros)" v={f.diluenteLitros} on={(v) => setF({ ...f, diluenteLitros: v })} dir />
              <Campo r="R$ por litro" v={f.diluentePreco} on={(v) => setF({ ...f, diluentePreco: v })} dir />
              <Campo r="Componente B (qtd)" v={f.componenteBQtd} on={(v) => setF({ ...f, componenteBQtd: v })} dir />
              <Campo r="R$ unitário" v={f.componenteBPreco} on={(v) => setF({ ...f, componenteBPreco: v })} dir />
            </div>
          </div>)}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo r="Seu nome" v={f.contato} on={(v) => setF({ ...f, contato: v })} full />
            <Campo r="Prazo de entrega" v={f.prazo} on={(v) => setF({ ...f, prazo: v })} full />
            <Campo r="Validade da proposta" v={f.validade} on={(v) => setF({ ...f, validade: v })} full />
          </div>
          <label className="block text-[11px] font-semibold text-[#0D1F3C]">Observações
            <textarea rows={3} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })}
              placeholder="rendimento considerado, embalagem, condição comercial…"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] font-normal focus:border-[#006EAB] focus:outline-none focus:ring-1 focus:ring-[#006EAB]" />
          </label>

          {erro && <p className="text-[13px] text-red-600">{erro}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={enviando}
              className="rounded-lg bg-[#006EAB] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#0D1F3C] disabled:opacity-50">
              {enviando ? "Enviando…" : "Enviar proposta"}
            </button>
            {total > 0 && <span className="text-[13px] text-gray-600">Total: <strong className="text-[#0D1F3C]">{brl(total)}</strong></span>}
          </div>
        </form>
      )}

      <p className="mt-6 text-[11px] text-gray-400">
        Torg Metal · consulta de orçamento. Este link é único e privado.
      </p>
    </Moldura>
  );
}

function Moldura({ children }) {
  return (
    <div className="min-h-screen bg-[#f3f5f8] py-8 px-4">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 sm:p-8 shadow-sm">{children}</div>
    </div>
  );
}

function Campo({ r, v, on, dir, full }) {
  return (
    <label className={`block text-[11px] font-semibold text-[#0D1F3C] ${full ? "" : ""}`}>
      {r}
      <input value={v ?? ""} onChange={(e) => on(e.target.value)}
        className={`mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px] font-normal focus:border-[#006EAB] focus:outline-none focus:ring-1 focus:ring-[#006EAB] ${dir ? "text-right" : ""}`} />
    </label>
  );
}
