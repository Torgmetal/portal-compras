"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, AlertTriangle, Check } from "lucide-react";
import { DESCONTINUIDADES, LAUDOS, laudoSugerido, LUX_MINIMO, TECNICAS, CONDICOES, METAIS_BASE, TIPOS_PECA } from "@/lib/evs-campos";
import { TIPOS_ESTRUTURA, criteriosDoDefeito } from "@/lib/aws-d11";

/**
 * O PREENCHIMENTO DO ENSAIO VISUAL DE SOLDA.
 *
 * Vitor (21/08/2026): "construa o caminho para o inspetor de qualidade preencher as informações
 * para gerar os dados do relatório".
 *
 * O que guiou o desenho da tela veio do PO-06, não do meu gosto:
 *
 *  · item 6.2 — a iluminação mínima é 1076 lux, medida na superfície com luxímetro calibrado. Virou
 *    campo numérico com aviso, não texto livre: é o número que um auditor confere primeiro.
 *  · item 7 — os instrumentos são lista fechada (calibre de solda, Hi-Lo, paquímetro, goniômetro,
 *    lupa, escala, trena), e saem do controle de calibração.
 *  · item 9.4 — para estrutura metálica o critério é a AWS D1.1.
 *  · item 12.1 — o ensaio só vale se executado por inspetor qualificado.
 *
 * ⚠ QUASE NADA É TEXTO LIVRE. Peça, soldador, descontinuidade e laudo são escolhas — o relatório
 * precisa ser pesquisável ("quantas mordeduras na OP-089?") e comparável entre inspetores.
 */
export default function FormEVS({ rel, linhas, res, travado, setLinhas, setResultado }) {
  const [soldadores, setSoldadores] = useState([]);
  const marcas = Array.isArray(rel.marcas) ? rel.marcas : [];

  useEffect(() => {
    fetch("/api/qualidade/inspecoes/soldadores")
      .then((r) => r.json()).then((j) => setSoldadores(j.soldadores || [])).catch(() => {});
  }, []);

  const lux = Number(res.iluminacao);
  const luxBaixo = Number.isFinite(lux) && lux > 0 && lux < LUX_MINIMO;

  const set = (i, campo, v) => setLinhas(linhas.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));
  const addLinha = () => setLinhas([...linhas, { marca: marcas[0] || "", qtd: 1, descricao: "", eps: "", soldador: "", descontinuidade: "", laudo: "" }]);
  const rmLinha = (i) => setLinhas(linhas.filter((_, k) => k !== i));

  /** Liga/desliga um código na linha e sugere o laudo. */
  function alternarDefeito(i, cod) {
    const atuais = String(linhas[i]?.descontinuidade || "").split(/[\s,;]+/).filter(Boolean);
    const novos = atuais.includes(cod) ? atuais.filter((c) => c !== cod) : [...atuais, cod];
    const sug = laudoSugerido(novos);
    setLinhas(linhas.map((l, k) => (k === i ? {
      ...l,
      descontinuidade: novos.join(" "),
      // ⚠ só preenche o laudo quando a regra é inequívoca (trinca, falta de fusão/penetração) ou
      // quando não há defeito nenhum. No meio-termo quem julga é o inspetor, com o critério na mão.
      laudo: sug || (novos.length ? l.laudo : "A"),
    } : l)));
  }

  const Campo = ({ rot, k, tipo = "text", opcoes = null, largura = "" }) => (
    <label className={`block ${largura}`}>
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{rot}</span>
      {opcoes ? (
        <select value={res[k] || ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue disabled:bg-gray-50">
          <option value="">—</option>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={tipo} value={res[k] ?? ""} disabled={travado}
          onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
      )}
    </label>
  );

  return (
    <div className="space-y-3">
      {/* ── condições do ensaio ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Condições do ensaio</p>
        <div className="grid sm:grid-cols-3 gap-2.5">
          <Campo rot="Tipo de estrutura" k="tipoPeca" opcoes={TIPOS_PECA} />
          <Campo rot="Componente / parte" k="componente" />
          <Campo rot="Metal base" k="metalBase" opcoes={METAIS_BASE} />
          <label className="block">
            <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">
              Iluminação (lux) <span className="font-normal">· mínimo {LUX_MINIMO}</span>
            </span>
            <input type="number" value={res.iluminacao ?? ""} disabled={travado}
              onChange={(e) => setResultado("iluminacao", e.target.value)}
              className={`w-full text-[12px] border rounded-lg px-2 py-1.5 outline-none disabled:bg-gray-50 ${
                luxBaixo ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-torg-blue"}`} />
            {luxBaixo && (
              <span className="text-[10px] text-red-600 inline-flex items-center gap-1 mt-0.5">
                <AlertTriangle size={10} /> abaixo do mínimo do PO-06 (item 6.2)
              </span>
            )}
          </label>
          <Campo rot="Técnica de inspeção" k="tecnica" opcoes={TECNICAS} />
          <Campo rot="Condições superficiais" k="condicoes" opcoes={CONDICOES} />
          <label className="block">
            <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Carregamento (AWS D1.1) · define os limites</span>
            <select value={res.tipoEstrutura || ""} disabled={travado}
              onChange={(e) => setResultado("tipoEstrutura", e.target.value)}
              className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue disabled:bg-gray-50">
              <option value="">— escolha para ver os limites</option>
              {TIPOS_ESTRUTURA.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
          <Campo rot="Critério de aceitação" k="criterio" />
        </div>
        <p className="text-[10px] text-torg-gray mt-2">
          Procedimento: <strong className="text-torg-dark">{res.procedimento || "—"}</strong>
          {res.procedimento && <span> · do Controle de Documentos</span>}
        </p>
      </div>

      {/* ── juntas inspecionadas ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-bold text-torg-dark">Juntas inspecionadas · {linhas.length}</p>
          {!travado && (
            <button onClick={addLinha}
              className="text-[11px] text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium">
              <Plus size={12} /> Nova junta
            </button>
          )}
        </div>

        {!linhas.length && <p className="text-[12px] text-torg-gray">Nenhuma junta lançada. Toque em “Nova junta”.</p>}

        <div className="space-y-2">
          {linhas.map((l, i) => {
            const marcados = String(l.descontinuidade || "").split(/[\s,;]+/).filter(Boolean);
            const sold = soldadores.find((s) => s.nome === l.soldador);
            return (
              <div key={i} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50">
                <div className="grid sm:grid-cols-[1fr_60px_1.6fr_1fr_1.4fr_auto] gap-2 items-end">
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">Peça</span>
                    <select value={l.marca || ""} disabled={travado} onChange={(e) => set(i, "marca", e.target.value)}
                      className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 font-mono disabled:bg-gray-50">
                      <option value="">—</option>
                      {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">Qtde</span>
                    <input type="number" value={l.qtd ?? ""} disabled={travado} onChange={(e) => set(i, "qtd", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50" />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">Descrição da junta</span>
                    <input value={l.descricao || ""} disabled={travado} onChange={(e) => set(i, "descricao", e.target.value)}
                      placeholder="filete alma/mesa, topo…"
                      className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50" />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">EPS</span>
                    <input value={l.eps || ""} disabled={travado} onChange={(e) => set(i, "eps", e.target.value)}
                      className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 font-mono disabled:bg-gray-50" />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">
                      Soldador {sold?.vencido && <span className="text-red-600 font-semibold">· certificação vencida</span>}
                    </span>
                    <select value={l.soldador || ""} disabled={travado} onChange={(e) => set(i, "soldador", e.target.value)}
                      className={`w-full text-[12px] border rounded px-1.5 py-1 disabled:bg-gray-50 ${sold?.vencido ? "border-red-400 bg-red-50" : "border-gray-200"}`}>
                      <option value="">—</option>
                      {soldadores.map((s) => <option key={s.nome} value={s.nome}>{s.nome}{s.vencido ? " (vencido)" : ""}</option>)}
                    </select>
                  </label>
                  {!travado && (
                    <button onClick={() => rmLinha(i)} className="text-torg-gray hover:text-red-600 pb-1.5" title="Remover junta">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* descontinuidades: botões, não digitação */}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-torg-gray mr-1">Descontinuidades:</span>
                  {DESCONTINUIDADES.map((d) => {
                    const on = marcados.includes(d.c);
                    return (
                      <button key={d.c} onClick={() => !travado && alternarDefeito(i, d.c)} title={d.nome}
                        className={`text-[10px] font-bold rounded px-1.5 py-0.5 border ${
                          on ? (d.grave ? "bg-red-600 text-white border-red-600" : "bg-torg-orange text-white border-torg-orange")
                             : "text-torg-gray border-gray-200 hover:border-torg-blue"}`}>
                        {d.c}
                      </button>
                    );
                  })}
                  <span className="flex-1" />
                  <span className="text-[10px] text-torg-gray mr-1">Laudo:</span>
                  {LAUDOS.map((v) => {
                    const on = l.laudo === v.c;
                    const cor = v.c === "A" ? "bg-emerald-600 border-emerald-600" : v.c === "R" ? "bg-red-600 border-red-600" : "bg-amber-500 border-amber-500";
                    return (
                      <button key={v.c} onClick={() => !travado && set(i, "laudo", v.c)} title={v.nome}
                        className={`text-[10px] font-bold rounded px-2 py-0.5 border ${on ? `${cor} text-white` : "text-torg-gray border-gray-200 hover:border-torg-blue"}`}>
                        {on && <Check size={9} className="inline mr-0.5" />}{v.c}
                      </button>
                    );
                  })}
                </div>
                {/* ── O LIMITE, AO LADO DO DEFEITO ────────────────────────────────────────
                    Vitor pediu o critério na tela. Sem ele, o inspetor marca "mordedura" e decide
                    de cabeça se passa — e o limite muda com o tipo de estrutura (1 mm na estática,
                    0,25 mm em membro primário da cíclica). Ler a regra na hora de julgar é o que
                    torna o laudo defensável numa auditoria. */}
                {marcados.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {marcados.map((c) => {
                      const d = DESCONTINUIDADES.find((x) => x.c === c);
                      const crit = criteriosDoDefeito(c, res.tipoEstrutura);
                      return (
                        <div key={c} className="text-[10px] leading-snug">
                          <span className="font-semibold text-torg-dark">{c} · {d?.nome || c}</span>
                          {d?.grave && <span className="text-red-600 font-semibold"> — sem tolerância na AWS D1.1</span>}
                          {!res.tipoEstrutura && crit.length === 0 && !d?.grave && (
                            <span className="text-torg-gray"> — escolha o tipo de estrutura para ver o limite</span>
                          )}
                          {crit.map((k) => (
                            <p key={`${k.n}${k.letra || ""}`} className="text-torg-gray pl-2 border-l-2 border-gray-200 mt-0.5">
                              <strong>({k.n}{k.letra ? k.letra : ""}) {k.titulo}:</strong> {k.texto}
                            </p>
                          ))}
                          {crit.length === 0 && res.tipoEstrutura && !d?.grave && (
                            <span className="text-torg-gray"> — a tabela 11 não fixa limite para esta descontinuidade; ver PO-06</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
