"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, ClipboardList } from "lucide-react";
import { escopoDoTipo, amostragemDoTipo } from "@/lib/pit-escopo";
import PlpPainel from "./PlpPainel";
import {
  GRAUS_LIMPEZA, GRAUS_INTEMPERISMO, METODOS_APLICACAO, TEMPO, CAMPOS_DEMAO,
  RUGOSIDADE_MIN, RUGOSIDADE_MAX, mediaRugosidade, mediaEspessura, condicoesPermitemPintar,
} from "@/lib/pintura-campos";

/**
 * O PREENCHIMENTO DA INSPEÇÃO DE PINTURA.
 *
 * Baseado no PO-05 Rev.3 (09/02/2026) — "Preparação de Superfície e Pintura".
 *
 * ⚠ A VERIFICAÇÃO DE CONDIÇÃO AMBIENTAL É O CORAÇÃO DESTA TELA. O item 5.4 do procedimento é
 * explícito e cada regra é verificável: ambiente ≥ 5 °C, superfície ao menos 3 °C acima do ponto de
 * orvalho, superfície ≤ 52 °C, umidade ≤ 85%, sem chuva/nevoeiro/bruma.
 *
 * Pintar fora disso é a causa clássica de falha de revestimento — a tinta parece boa no dia e
 * descola meses depois, já na obra do cliente. E a regra do orvalho é a que se erra de cabeça: não
 * basta estar acima, tem de estar 3 °C acima.
 *
 * ⚠ O ESQUEMA DE PINTURA vem do PLP da obra, não do procedimento. Produto, fabricante e espessura
 * especificada são digitados a partir dele; fixar no código seria inventar um esquema.
 */
export default function FormPintura({ rel, res, travado, setResultado }) {
  // ⚠ O PIT DA OBRA DIZ O QUE ESTE RELATÓRIO DEVE TER. Vitor (21/08/2026): "temos alguns campos como
  // pull-off, salinidade, que nem sempre serão utilizados... o PIT é quem vai ditar o que vamos ter
  // naquele relatório". Sem isso o formulário nasce com tudo, e campo em branco vira ambiguidade:
  // ninguém sabe se é "não se aplica" ou "esqueceram de medir".
  const [pit, setPit] = useState({ escopo: null, temPIT: false, carregando: true });
  // ⚠ as tintas que a obra REALMENTE recebeu, do CMR. Vitor (22/08/2026): "se buscarmos na CMR
  // vamos conseguir o registro das tintas que foram especificadas para cada obra... poderia deixar
  // isso mais dinâmico e rápido, para apenas preencher os valores encontrados". Escolher a tinta
  // preenche produto, fabricante, lote e validade de uma vez — quatro campos que o inspetor
  // digitava do rótulo da lata, com o erro que isso implica.
  const [tintas, setTintas] = useState([]);
  useEffect(() => {
    fetch(`/api/qualidade/pit?opNumero=${encodeURIComponent(rel.opNumero)}`)
      .then((r) => r.json())
      .then((j) => setPit({ escopo: j.escopo, temPIT: !!j.temPIT, carregando: false }))
      .catch(() => setPit({ escopo: null, temPIT: false, carregando: false }));
  }, [rel.opNumero]);

  const esc = escopoDoTipo("PINTURA", pit.escopo);
  const amostragem = amostragemDoTipo(pit.escopo, "PINTURA");

  const dem = res.demaos || {};
  const esp = res.espessuras || {};
  const rug = Array.isArray(res.rugLeituras) ? res.rugLeituras : ["", "", "", "", ""];

  const setDemao = (n, k, v) => setResultado("demaos", { ...dem, [n]: { ...(dem[n] || {}), [k]: v } });
  const setEsp = (n, i, v) => {
    const atual = Array.isArray(esp[n]) ? [...esp[n]] : ["", "", "", "", ""];
    atual[i] = v;
    setResultado("espessuras", { ...esp, [n]: atual });
  };
  const setRug = (i, v) => { const a = [...rug]; a[i] = v; setResultado("rugLeituras", a); };

  const Campo = ({ rot, k, tipo = "text", opcoes = null, largura = "" }) => (
    <label className={`block ${largura}`}>
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{rot}</span>
      {opcoes ? (
        <select value={res[k] || ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue disabled:bg-gray-50">
          <option value="">—</option>
          {opcoes.map((o) => <option key={o.id || o} value={o.id || o}>{o.nome || o}</option>)}
        </select>
      ) : (
        <input type={tipo} value={res[k] ?? ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
      )}
    </label>
  );

  const mediaRug = mediaRugosidade(rug);
  const rugFora = mediaRug != null && (mediaRug < RUGOSIDADE_MIN || mediaRug > RUGOSIDADE_MAX);

  const desligados = Object.entries(esc).filter(([, v]) => !v).length;

  return (
    <div className="space-y-3">
      {/* ⚠ dizer QUAL PIT está valendo é parte do controle: sem isso, o inspetor não sabe se o campo
          que falta é "não se aplica" ou defeito da tela. */}
      <div className="rounded-lg border border-torg-blue-200 bg-torg-blue/5 px-3 py-2 text-[11px] text-torg-dark inline-flex items-start gap-1.5 w-full">
        <ClipboardList size={13} className="text-torg-blue mt-0.5 shrink-0" />
        <span>
          {pit.carregando ? "lendo o PIT da obra…"
            : pit.temPIT
            ? <>Campos conforme o <strong>PIT da OP-{rel.opNumero}</strong>{desligados > 0 ? ` · ${desligados} ensaio(s) fora do escopo desta obra` : ""}.</>
            : <>Esta OP ainda não tem PIT na §10 do data book — valendo o escopo <strong>padrão</strong> do PO-05.</>}
          {amostragem && <> Amostragem: <strong>{amostragem}</strong>.</>}
        </span>
      </div>

      {/* ── preparação de superfície ──────────────────────────────────────────────── */}
      <PlpPainel opNumero={rel.opNumero} podeEditar={!travado} onTintas={setTintas} />

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Preparação de superfície</p>
        <div className="grid sm:grid-cols-4 gap-2.5">
          <Campo rot="Procedimento de preparo" k="prepProcedimento" />
          <Campo rot="Data" k="prepData" tipo="date" />
          <Campo rot="Horário inicial" k="prepIni" tipo="time" />
          <Campo rot="Horário final" k="prepFim" tipo="time" />
          <Campo rot="Grau de limpeza" k="limpeza" opcoes={GRAUS_LIMPEZA} />
          {esc.intemperismo && <Campo rot="Grau de intemperismo" k="intemperismo" opcoes={GRAUS_INTEMPERISMO} />}
          <Campo rot="Tipo de abrasivo" k="abrasivo" />
          <Campo rot="Rugosidade especificada (PLP)" k="rugEspec" />
          {esc.poeira && <Campo rot="Poeira (ISO 8502-3)" k="poeira" />}
          {esc.salinidade && <Campo rot="Salinidade — Bresle (ISO 8502-6/9)" k="salinidade" />}
        </div>

        {/* ⚠ item 5.5.1.1: o perfil é a MÉDIA DE CINCO MEDIÇÕES, entre 50 e 90 µm ou conforme PLP */}
        {esc.rugosidade && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-torg-gray mb-1">
            Perfil de rugosidade · média de 5 medições (µm) — faixa {RUGOSIDADE_MIN} a {RUGOSIDADE_MAX} ou conforme PLP
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            {[0, 1, 2, 3, 4].map((i) => (
              <input key={i} type="number" value={rug[i] ?? ""} disabled={travado} onChange={(e) => setRug(i, e.target.value)}
                className="w-16 text-[12px] text-center border border-gray-200 rounded px-1 py-1 disabled:bg-gray-50" />
            ))}
            <span className={`text-[12px] font-semibold rounded px-2 py-1 border ${
              mediaRug == null ? "text-torg-gray border-gray-200"
                : rugFora ? "text-red-700 bg-red-50 border-red-200" : "text-emerald-700 bg-emerald-50 border-emerald-200"}`}>
              média {mediaRug ?? "—"} µm {rugFora && "· fora da faixa"}
            </span>
          </div>
        </div>
        )}
      </div>

      {/* ── condições ambientais ──────────────────────────────────────────────────── */}
      <CondicoesAmbientais res={res} travado={travado} setResultado={setResultado} Campo={Campo} />

      {/* ── aplicação: 3 demãos em colunas ────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm overflow-x-auto">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Aplicação das tintas</p>
        <table className="w-full text-[11px] min-w-[560px]">
          <thead>
            <tr className="text-[10px] text-torg-gray">
              <th className="text-left font-semibold pb-1 w-[34%]">Demão</th>
              {["1ª", "2ª", "3ª"].map((t) => <th key={t} className="pb-1 font-semibold">{t} demão</th>)}
            </tr>
          </thead>
          <tbody>
              {/* escolher a tinta do CMR preenche produto, fabricante, lote e validade */}
              {tintas.length > 0 && (
                <tr className="border-b border-gray-50 bg-torg-blue-50/40">
                  <td className="py-1 text-torg-blue font-semibold">Tinta do CMR</td>
                  {[1, 2, 3].map((n) => (
                    <td key={n} className="py-1 px-0.5">
                      <select value="" disabled={travado}
                        onChange={(e) => {
                          const t = tintas.find((x) => x.id === e.target.value);
                          if (!t) return;
                          setResultado("demaos", {
                            ...dem,
                            [n]: {
                              ...(dem[n] || {}),
                              produto: t.produto,
                              ...(t.fabricante ? { fabricante: t.fabricante } : {}),
                              ...(t.lote ? { loteA: t.lote } : {}),
                              ...(t.validade ? { valA: String(t.validade).slice(0, 10) } : {}),
                            },
                          });
                        }}
                        className="w-full text-[11px] border border-torg-blue-200 rounded px-1.5 py-1 text-torg-blue disabled:bg-gray-50">
                        <option value="">escolher…</option>
                        {tintas.map((t) => (
                          <option key={t.id} value={t.id}>{t.produto}{t.lote ? ` · lote ${t.lote}` : ""}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              )}
            {CAMPOS_DEMAO
              // ⚠ a linha de aderência some quando o ensaio X está fora do escopo da obra
              .filter(({ k }) => (k === "aderencia" ? esc.aderenciaX : true))
              .map(({ k, rot, tipo, opcoes }) => (
              <tr key={k} className="border-t border-gray-50">
                <td className="py-1 text-torg-gray">{rot}</td>
                {["1", "2", "3"].map((n) => (
                  <td key={n} className="py-1 px-0.5">
                    {opcoes ? (
                      <select value={dem[n]?.[k] || ""} disabled={travado} onChange={(e) => setDemao(n, k, e.target.value)}
                        className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50">
                        <option value="">—</option>
                        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={tipo || "text"} value={dem[n]?.[k] ?? ""} disabled={travado} onChange={(e) => setDemao(n, k, e.target.value)}
                        className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── espessuras ────────────────────────────────────────────────────────────── */}
      {esc.espessura && (
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm overflow-x-auto">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[12px] font-bold text-torg-dark">Medições de espessura (µm)</p>
          <span className="text-[10px] text-torg-gray">a média é calculada</span>
        </div>
        <table className="w-full text-[11px] min-w-[420px]">
          <thead>
            <tr className="text-[10px] text-torg-gray">
              <th className="text-left font-semibold pb-1 w-[28%]">Leitura</th>
              {["1ª", "2ª", "3ª"].map((t) => <th key={t} className="pb-1 font-semibold">{t} demão</th>)}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4].map((i) => (
              <tr key={i} className="border-t border-gray-50">
                <td className="py-1 text-torg-gray">Leitura {i + 1}</td>
                {["1", "2", "3"].map((n) => (
                  <td key={n} className="py-1 px-0.5">
                    <input type="number" value={(esp[n] || [])[i] ?? ""} disabled={travado} onChange={(e) => setEsp(n, i, e.target.value)}
                      className="w-full text-[11px] text-center border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50" />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-gray-200 bg-gray-50/60">
              <td className="py-1.5 font-bold text-torg-dark">Média geral</td>
              {["1", "2", "3"].map((n) => (
                <td key={n} className="py-1.5 text-center font-bold text-torg-dark">{mediaEspessura(esp[n]) ?? "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <div className="grid sm:grid-cols-2 gap-2.5 mt-3">
          <Campo rot="Espessura mínima especificada (PLP)" k="espessuraMinima" />
          <Campo rot="Laudo final" k="laudo" opcoes={["Aprovado", "Reprovado"]} />
        </div>
      </div>
      )}

      {/* ── pull-off: só quando o PIT da obra pede ────────────────────────────────── */}
      {esc.pullOff && (
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <p className="text-[12px] font-bold text-torg-dark mb-2">Aderência — pull-off</p>
          <div className="grid sm:grid-cols-4 gap-2.5">
            <Campo rot="Equipamento" k="pullOffEquip" />
            <Campo rot="Valor obtido (MPa)" k="pullOffValor" tipo="number" />
            <Campo rot="Mínimo exigido (MPa)" k="pullOffMin" tipo="number" />
            <Campo rot="Tipo de ruptura" k="pullOffRuptura" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * As condições ambientais, com a verificação do item 5.4.
 *
 * ⚠ Separado em componente porque é o bloco que MUDA a decisão: o resto da tela registra, este
 * julga. Ele diz, com a regra na mão, se a aplicação era permitida — e nomeia o impedimento.
 */
function CondicoesAmbientais({ res, travado, setResultado, Campo }) {
  const r = condicoesPermitemPintar({
    tAmbiente: res.prepTAmb, tSuperficie: res.prepTSup,
    pontoOrvalho: res.prepOrvalho, umidade: res.prepUmidade, tempo: res.tempo,
  });
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <p className="text-[12px] font-bold text-torg-dark mb-2">Condições ambientais · PO-05, item 5.4</p>
      <div className="grid sm:grid-cols-5 gap-2.5">
        <Campo rot="Umidade relativa (%)" k="prepUmidade" tipo="number" />
        <Campo rot="Temp. ambiente (°C)" k="prepTAmb" tipo="number" />
        <Campo rot="Temp. superfície (°C)" k="prepTSup" tipo="number" />
        <Campo rot="Ponto de orvalho (°C)" k="prepOrvalho" tipo="number" />
        <Campo rot="Tempo" k="tempo" opcoes={TEMPO} />
      </div>

      {!r.avaliado ? (
        <p className="text-[11px] text-torg-gray mt-2">
          Informe umidade, as duas temperaturas e o ponto de orvalho para o portal conferir as condições.
        </p>
      ) : r.permitido ? (
        <p className="text-[12px] text-emerald-700 mt-2 inline-flex items-center gap-1.5 font-medium">
          <Check size={13} /> Condições dentro do PO-05 — aplicação permitida.
        </p>
      ) : (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-2.5 py-2">
          <p className="text-[12px] font-semibold text-red-700 inline-flex items-center gap-1.5">
            <AlertTriangle size={13} /> Condições fora do PO-05 — não era permitido aplicar:
          </p>
          {r.impedimentos.map((m) => <p key={m} className="text-[11px] text-red-700 pl-5">· {m}</p>)}
        </div>
      )}
    </div>
  );
}
