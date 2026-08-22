"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  APARELHOS, CABECOTES, ANGULOS, ACOPLANTES, BLOCOS_PADRAO, FACES,
  TIPOS_CARREGAMENTO, classificacaoIndicacao, TABELA_ACEITACAO_DISPONIVEL,
} from "@/lib/us-campos";
import { LAUDOS } from "@/lib/evs-campos";

/**
 * O PREENCHIMENTO DO ENSAIO POR ULTRASSOM, no computador.
 *
 * Vitor (21/08/2026): "quando eu clico em um relatório já criado, tanto no PC quanto no celular, não
 * me dá mais a opção de colocar alguma informação; eu posso tanto criar um relatório do PC quanto do
 * celular".
 *
 * Está certo e era um buraco: o computador só tinha formulário para dimensional e visual de solda.
 * Quem monta o relatório no escritório precisa poder preenchê-lo ali também — nem todo ensaio é
 * lançado no chão de fábrica.
 *
 * As listas e as fórmulas são do PI-QUA-003, iguais às do celular, porque moram no mesmo módulo.
 */
export default function FormUS({ rel, linhas, res, travado, setLinhas, setResultado }) {
  const marcas = Array.isArray(rel.marcas) ? rel.marcas : [];
  const [soldadores, setSoldadores] = useState([]);

  useEffect(() => {
    fetch("/api/qualidade/soldagem").then((r) => r.json())
      .then((j) => setSoldadores(j.soldadores || [])).catch(() => {});
  }, []);

  const set = (i, campo, v) => setLinhas(linhas.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));
  const addLinha = () => setLinhas([...linhas, { marca: marcas[0] || "", indicacao: String(linhas.length + 1), laudo: "R" }]);

  const Campo = ({ rot, k, opcoes = null, tipo = "text", destaque = false }) => (
    <label className="block">
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{rot}</span>
      {opcoes ? (
        <select value={res[k] || ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className={`w-full text-[12px] border rounded-lg px-2 py-1.5 disabled:bg-gray-50 ${
            destaque && !res[k] ? "border-amber-400 bg-amber-50" : "border-gray-200 focus:border-torg-blue"}`}>
          <option value="">—</option>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={tipo} value={res[k] ?? ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
      )}
    </label>
  );

  const N = ({ l, i, k, rot }) => (
    <label className="block">
      <span className="block text-[10px] text-torg-gray mb-0.5">{rot}</span>
      <input type="number" value={l[k] ?? ""} disabled={travado} onChange={(e) => set(i, k, e.target.value)}
        className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50" />
    </label>
  );

  return (
    <div className="space-y-3">
      {/* ── o ensaio ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Condições do ensaio</p>
        <div className="grid sm:grid-cols-4 gap-2.5">
          {/* ⚠ obrigatório pelo item 18.1 do PI-QUA-003, e o critério muda com ele (15.6 × 15.7) */}
          <Campo rot="Tipo de estrutura" k="carregamento" opcoes={TIPOS_CARREGAMENTO.map((t) => t.nome)} destaque />
          <Campo rot="Local de ensaio" k="local" />
          <Campo rot="Acoplante" k="acoplante" opcoes={ACOPLANTES} />
          <Campo rot="Bloco padrão" k="blocoPadrao" opcoes={BLOCOS_PADRAO} />
          <Campo rot="Aparelho" k="apModelo" opcoes={APARELHOS} />
          <Campo rot="Nº de série do aparelho" k="apSerie" />
          <Campo rot="Cabeçote" k="cbModelo" opcoes={CABECOTES.map((c) => `${c.modelo}${c.angulo ? ` · ${c.angulo}°` : ""} · ${c.mhz} MHz`)} />
          <Campo rot="Nº de série do cabeçote" k="cbSerie" />
          <Campo rot="Ângulo real (graus)" k="cbAngulo" tipo="number" />
          <Campo rot="Ganho de varredura (dB)" k="ganhoVarredura" tipo="number" />
          <Campo rot="Material" k="material" />
          <Campo rot="Espessura" k="espessura" />
        </div>
        <p className="text-[10px] text-torg-gray mt-2">
          Procedimento: <strong className="text-torg-dark">{res.procedimento || "—"}</strong>
          {" · "}Critério: <strong className="text-torg-dark">{res.criterio || "—"}</strong>
        </p>
      </div>

      {/* ── indicações ───────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[12px] font-bold text-torg-dark">Descontinuidades registradas · {linhas.length}</p>
          {!travado && (
            <button onClick={addLinha}
              className="text-[11px] text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium">
              <Plus size={12} /> Nova indicação
            </button>
          )}
        </div>

        {/* ⚠ só o reprovado entra — item 15.1 do PI-QUA-003 */}
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2 inline-flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Registre apenas as descontinuidades <strong>reprovadas</strong> (item 15.1). Em solda crítica à fratura, também as até 6 dB abaixo do nível de rejeição.
        </p>

        {!linhas.length && <p className="text-[12px] text-torg-gray">Nenhuma indicação lançada.</p>}

        <div className="space-y-2">
          {linhas.map((l, i) => {
            const { c, d } = classificacaoIndicacao({ a: l.db_indicacao, b: l.db_referencia, percursoMm: l.percurso });
            const sold = soldadores.find((x) => x.nome === l.soldador);
            return (
              <div key={i} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50">
                <div className="grid sm:grid-cols-6 gap-2">
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">Peça</span>
                    <select value={l.marca || ""} disabled={travado} onChange={(e) => set(i, "marca", e.target.value)}
                      className="w-full text-[12px] font-mono border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50">
                      <option value="">—</option>
                      {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <N l={l} i={i} k="indicacao" rot="Nº indicação" />
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">Ângulo</span>
                    <select value={l.angulo || ""} disabled={travado} onChange={(e) => set(i, "angulo", e.target.value)}
                      className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50">
                      <option value="">—</option>
                      {ANGULOS.map((a) => <option key={a} value={a}>{a}°</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] text-torg-gray mb-0.5">Face</span>
                    <select value={l.face || ""} disabled={travado} onChange={(e) => set(i, "face", e.target.value)}
                      className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50">
                      <option value="">—</option>
                      {FACES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="block text-[10px] text-torg-gray mb-0.5">
                      Soldador {sold && !sold.qualificado && <span className="text-amber-700 font-semibold">· sem qualificação</span>}
                    </span>
                    <select value={l.soldador || ""} disabled={travado}
                      onChange={(e) => {
                        const x = soldadores.find((y) => y.nome === e.target.value);
                        setLinhas(linhas.map((ln, k) => (k === i ? { ...ln, soldador: e.target.value, sinete: x?.sinete || null } : ln)));
                      }}
                      className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50">
                      <option value="">—</option>
                      {soldadores.map((x) => <option key={x.id || x.nome} value={x.nome}>{x.sinete ? `${x.sinete} · ` : ""}{x.nome}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid sm:grid-cols-6 gap-2 mt-2">
                  <N l={l} i={i} k="db_indicacao" rot="a — indicação (dB)" />
                  <N l={l} i={i} k="db_referencia" rot="b — referência (dB)" />
                  <N l={l} i={i} k="percurso" rot="Percurso sônico (mm)" />
                  <N l={l} i={i} k="comprimento" rot="Compr. reprovado (mm)" />
                  <N l={l} i={i} k="profundidade" rot="Profund. face A (mm)" />
                  <N l={l} i={i} k="nivel" rot="Nível de defeito" />
                </div>

                <div className="grid sm:grid-cols-6 gap-2 mt-2 items-end">
                  <N l={l} i={i} k="dist_x" rot="Distância X (mm)" />
                  <N l={l} i={i} k="dist_y" rot="Distância Y (mm)" />
                  {/* ⚠ c e d calculados — itens 15.3 e 15.4; número que decide não se digita */}
                  <div className="sm:col-span-2 rounded bg-torg-blue/5 border border-torg-blue-200 px-2 py-1.5">
                    <p className="text-[11px] text-torg-dark">
                      <strong>c</strong> = {c ?? "—"} dB · <strong>d</strong> = <strong className="text-[13px]">{d ?? "—"}</strong> dB
                    </p>
                    <p className="text-[9px] text-torg-gray">d = a − b − c (itens 15.3 e 15.4)</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {LAUDOS.map((v) => {
                      const on = l.laudo === v.c;
                      const cor = v.c === "A" ? "bg-emerald-600 border-emerald-600" : v.c === "R" ? "bg-red-600 border-red-600" : "bg-amber-500 border-amber-500";
                      return (
                        <button key={v.c} onClick={() => !travado && set(i, "laudo", v.c)} title={v.nome}
                          className={`text-[10px] font-bold rounded px-2 py-1 border ${on ? `${cor} text-white` : "text-torg-gray border-gray-200 hover:border-torg-blue"}`}>
                          {v.c}
                        </button>
                      );
                    })}
                  </div>
                  {!travado && (
                    <button onClick={() => setLinhas(linhas.filter((_, k) => k !== i))} className="text-torg-gray hover:text-red-600 justify-self-end pb-1">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <input value={l.obs || ""} disabled={travado} onChange={(e) => set(i, "obs", e.target.value)}
                  placeholder="observação" className="mt-2 w-full text-[12px] border border-gray-200 rounded px-2 py-1 disabled:bg-gray-50" />
              </div>
            );
          })}
        </div>

        {!TABELA_ACEITACAO_DISPONIVEL && linhas.length > 0 && (
          <p className="text-[10px] text-torg-gray mt-2">
            O portal calcula o <strong>d</strong> mas não julga: as tabelas 2 e 3 do PI-QUA-003 estão como imagem no PDF e ainda não foram cadastradas.
          </p>
        )}
      </div>
    </div>
  );
}
