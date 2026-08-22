"use client";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Check, ChevronLeft, Save, Ruler } from "lucide-react";
import { DESCONTINUIDADES, LAUDOS, laudoSugerido, LUX_MINIMO, TECNICAS, CONDICOES, METAIS_BASE, TIPOS_PECA } from "@/lib/evs-campos";
import { TIPOS_ESTRUTURA, criteriosDoDefeito } from "@/lib/aws-d11";

/**
 * O INSPETOR DE CAMPO MEDINDO, NO CELULAR.
 *
 * Vitor (21/08/2026): "não estou conseguindo acessar os relatórios na tela do inspetor de campo".
 * Não dava mesmo — o portal de campo só fazia captura de foto. Este é o caminho que faltava.
 *
 * O desenho é o que ele descreveu: alguém monta o relatório no computador (cotas, tolerâncias,
 * cabeçalho) e o inspetor, no chão de fábrica, **só informa o que mediu**. Dimensão de projeto e
 * tolerância chegam prontas e aparecem ao lado — mas não se editam aqui.
 *
 * ⚠ TELA DE CHÃO DE FÁBRICA: alvo grande, teclado numérico, uma coisa por vez. Quem usa está de
 * luva, com o celular numa mão e o instrumento na outra.
 */
export default function Medir({ op, onSair, Tela, Equipamentos }) {
  const [lista, setLista] = useState(null);
  const [abertoId, setAbertoId] = useState(null);

  useEffect(() => {
    if (abertoId) return;
    setLista(null);
    fetch(`/api/campo/relatorios?opNumero=${encodeURIComponent(op.numero)}`)
      .then((r) => r.json()).then((j) => setLista(j.relatorios || [])).catch(() => setLista([]));
  }, [op.numero, abertoId]);

  if (abertoId) {
    return <Preencher id={abertoId} op={op} onVoltar={() => setAbertoId(null)} Tela={Tela} Equipamentos={Equipamentos} />;
  }

  return (
    <Tela titulo={`OP-${op.numero}`} sub="Relatórios para medir" voltar={onSair}>
      {lista === null && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> buscando…</p>}
      {lista && !lista.length && (
        <p className="text-sm text-torg-gray">
          Nenhum relatório aberto nesta OP. Eles são criados no computador, pela Qualidade.
        </p>
      )}
      <div className="space-y-2">
        {(lista || []).map((r) => (
          <button key={r.id} onClick={() => setAbertoId(r.id)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 active:bg-gray-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-bold text-torg-blue text-[15px]">{r.codigo}</span>
              {r.completo
                ? <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Check size={11} /> medido</span>
                : <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{r.medidas}/{r.aMedir}</span>}
            </div>
            <p className="text-[13px] text-torg-dark mt-0.5">{r.tipoLabel}</p>
            {r.marcas?.length > 0 && <p className="text-[12px] text-torg-gray font-mono">{r.marcas.join(", ")}</p>}
          </button>
        ))}
      </div>
    </Tela>
  );
}

function Preencher({ id, op, onVoltar, Tela, Equipamentos }) {
  const [rel, setRel] = useState(null);
  const [erro, setErro] = useState("");
  const [linhas, setLinhas] = useState([]);
  const [equipamentos, setEquipamentos] = useState([]);
  // ⚠ AS CONDIÇÕES DO ENSAIO SÃO DO CAMPO. Vitor (21/08/2026): "você só trouxe a medida do
  // luxímetro e o restante precisa ser preenchido também". Está certo — técnica, condições
  // superficiais e metal base são OBSERVADOS na hora, com a peça na frente. Quem monta o relatório
  // no computador não tem como saber se a junta foi escovada ou está como soldada.
  const [cond, setCond] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch(`/api/campo/relatorios/${id}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then((j) => {
        setRel(j.relatorio);
        setLinhas(Array.isArray(j.relatorio.linhas) ? j.relatorio.linhas : []);
        setEquipamentos(Array.isArray(j.relatorio.equipamentos) ? j.relatorio.equipamentos : []);
        const r0 = j.relatorio.resultados || {};
        setCond({
          iluminacao: r0.iluminacao ?? "", tecnica: r0.tecnica || "", condicoes: r0.condicoes || "",
          metalBase: r0.metalBase || "", tipoEstrutura: r0.tipoEstrutura || "", tipoPeca: r0.tipoPeca || "",
        });
      })
      .catch((e) => setErro(e.message));
  }, [id]);

  if (erro) return <Tela titulo="Relatório" voltar={onVoltar}><p className="text-sm text-red-600 inline-flex items-center gap-2"><AlertCircle size={15} /> {erro}</p></Tela>;
  if (!rel) return <Tela titulo="Relatório" voltar={onVoltar}><p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> abrindo…</p></Tela>;

  const ehDim = rel.tipo === "DIMENSIONAL";
  const set = (i, campo, v) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  function alternarDefeito(i, cod) {
    const atuais = String(linhas[i]?.descontinuidade || "").split(/[\s,;]+/).filter(Boolean);
    const novos = atuais.includes(cod) ? atuais.filter((c) => c !== cod) : [...atuais, cod];
    const sug = laudoSugerido(novos);
    setLinhas((p) => p.map((l, k) => (k === i ? { ...l, descontinuidade: novos.join(" "), laudo: sug || (novos.length ? l.laudo : "A") } : l)));
  }

  async function salvar() {
    setSalvando(true);
    try {
      // ⚠ manda só o que o campo pode escrever, com o ÍNDICE da linha — o servidor mescla. Mandar a
      // lista inteira apagaria a cota que a Qualidade acrescentou enquanto o celular estava no bolso.
      const medidas = linhas.map((l, i) => ({
        i,
        ...(ehDim ? { encontradoMm: l.encontradoMm } : { laudo: l.laudo, descontinuidade: l.descontinuidade }),
        obs: l.obs ?? null,
      }));
      const r = await fetch(`/api/campo/relatorios/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medidas, equipamentos, assumirInspetor: !rel.inspetor, condicoes: ehDim ? undefined : cond }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      alert("Medidas gravadas.");
      onVoltar();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  const lux = Number(cond.iluminacao);
  const luxBaixo = Number.isFinite(lux) && lux > 0 && lux < LUX_MINIMO;
  const medir = linhas.filter((l) => l.letra || l.marca);

  return (
    <Tela titulo={rel.codigo} sub={rel.tipoLabel} voltar={onVoltar}>
      <Equipamentos escolhidos={equipamentos} onMudar={setEquipamentos} />

      {!ehDim && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[12px] font-semibold text-torg-gray">Condições do ensaio</p>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Iluminação medida (lux) · mínimo {LUX_MINIMO}</span>
            <input type="number" inputMode="numeric" value={cond.iluminacao ?? ""}
              onChange={(e) => setCond((c) => ({ ...c, iluminacao: e.target.value }))}
              className={`w-full text-lg border-2 rounded-xl px-3 py-3 outline-none ${luxBaixo ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-torg-blue"}`} />
            {luxBaixo && <span className="text-[12px] text-red-600 inline-flex items-center gap-1 mt-1"><AlertCircle size={12} /> abaixo do mínimo do PO-06</span>}
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Técnica de inspeção</span>
            <select value={cond.tecnica || ""} onChange={(e) => setCond((c) => ({ ...c, tecnica: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {TECNICAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Condições superficiais</span>
            <select value={cond.condicoes || ""} onChange={(e) => setCond((c) => ({ ...c, condicoes: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {CONDICOES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Tipo de estrutura</span>
            <select value={cond.tipoPeca || ""} onChange={(e) => setCond((c) => ({ ...c, tipoPeca: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {TIPOS_PECA.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Metal base</span>
            <select value={cond.metalBase || ""} onChange={(e) => setCond((c) => ({ ...c, metalBase: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {METAIS_BASE.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          {/* ⚠ o tipo de estrutura decide QUAL limite vale para cada defeito — sem ele, os critérios
              não aparecem embaixo da descontinuidade e o inspetor julga de cabeça. */}
          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">
              Carregamento (AWS D1.1) {!cond.tipoEstrutura && <span className="text-amber-700">· defina para ver os limites</span>}
            </span>
            <select value={cond.tipoEstrutura || ""} onChange={(e) => setCond((c) => ({ ...c, tipoEstrutura: e.target.value }))}
              className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none ${cond.tipoEstrutura ? "border-gray-200 focus:border-torg-blue" : "border-amber-300 bg-amber-50"}`}>
              <option value="">—</option>
              {TIPOS_ESTRUTURA.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
        </div>
      )}

      <p className="text-[12px] font-semibold text-torg-gray mt-4 mb-1.5 inline-flex items-center gap-1.5">
        <Ruler size={13} className="text-torg-blue" /> {ehDim ? "Cotas a medir" : "Juntas a inspecionar"} · {medir.length}
      </p>

      <div className="space-y-2.5">
        {linhas.map((l, i) => {
          if (!l.letra && !l.marca) return null;
          const marcados = String(l.descontinuidade || "").split(/[\s,;]+/).filter(Boolean);
          const dif = ehDim && l.encontradoMm != null && l.projetoMm != null ? Number(l.encontradoMm) - Number(l.projetoMm) : null;
          const tol = parseFloat(String(l.tolerancia || "").replace(/[^\d.,]/g, "").replace(",", "."));
          const fora = dif != null && Number.isFinite(tol) && Math.abs(dif) > tol;
          return (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-torg-dark text-[15px]">{l.descricao || l.marca}</span>
                {ehDim && <span className="text-[13px] text-torg-gray">projeto <strong className="text-torg-dark font-mono">{l.projetoMm ?? "—"}</strong> {l.tolerancia || ""}</span>}
              </div>

              {ehDim ? (
                <div className="mt-2">
                  <input type="number" inputMode="decimal" value={l.encontradoMm ?? ""}
                    onChange={(e) => set(i, "encontradoMm", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="medida encontrada"
                    className={`w-full text-2xl font-mono text-center border-2 rounded-xl py-3 outline-none ${
                      fora ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 focus:border-torg-blue"}`} />
                  {dif != null && (
                    <p className={`text-center text-[13px] mt-1 font-semibold ${fora ? "text-red-600" : "text-emerald-700"}`}>
                      {dif > 0 ? "+" : ""}{Math.round(dif * 10) / 10} mm {fora ? "· fora da tolerância" : "· dentro"}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {DESCONTINUIDADES.map((d) => {
                      const on = marcados.includes(d.c);
                      return (
                        <button key={d.c} onClick={() => alternarDefeito(i, d.c)} title={d.nome}
                          className={`text-[13px] font-bold rounded-lg px-2.5 py-2 border ${
                            on ? (d.grave ? "bg-red-600 text-white border-red-600" : "bg-torg-orange text-white border-torg-orange")
                               : "text-torg-gray border-gray-200 active:bg-gray-50"}`}>
                          {d.c}
                        </button>
                      );
                    })}
                  </div>
                  {/* o critério do defeito, para julgar com a regra à vista */}
                  {marcados.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {marcados.map((c) => {
                        const d = DESCONTINUIDADES.find((x) => x.c === c);
                        const crit = criteriosDoDefeito(c, cond.tipoEstrutura);
                        return (
                          <div key={c} className="text-[12px] leading-snug">
                            <span className="font-semibold text-torg-dark">{c} · {d?.nome}</span>
                            {d?.grave && <span className="text-red-600 font-semibold"> — sem tolerância</span>}
                            {crit.map((k) => (
                              <p key={`${k.n}${k.letra || ""}`} className="text-torg-gray pl-2 border-l-2 border-gray-200 mt-0.5">{k.texto}</p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {LAUDOS.map((v) => {
                      const on = l.laudo === v.c;
                      const cor = v.c === "A" ? "bg-emerald-600 border-emerald-600" : v.c === "R" ? "bg-red-600 border-red-600" : "bg-amber-500 border-amber-500";
                      return (
                        <button key={v.c} onClick={() => set(i, "laudo", v.c)}
                          className={`text-[14px] font-bold rounded-lg py-2.5 border ${on ? `${cor} text-white` : "text-torg-gray border-gray-200 active:bg-gray-50"}`}>
                          {v.c}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <input value={l.obs || ""} onChange={(e) => set(i, "obs", e.target.value)} placeholder="observação (opcional)"
                className="mt-2 w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-torg-blue" />
            </div>
          );
        })}
      </div>

      {!medir.length && (
        <p className="text-sm text-torg-gray">
          Este relatório ainda não tem {ehDim ? "cotas marcadas" : "juntas lançadas"}. Quem monta faz isso no computador.
        </p>
      )}

      <button onClick={salvar} disabled={salvando}
        className="mt-5 w-full bg-torg-blue text-white active:bg-torg-dark rounded-2xl py-5 text-lg font-semibold inline-flex items-center justify-center gap-2.5 disabled:opacity-60">
        {salvando ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />} Gravar medidas
      </button>
    </Tela>
  );
}
