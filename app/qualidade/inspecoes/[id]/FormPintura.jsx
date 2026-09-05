"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, ClipboardList } from "lucide-react";
import { escopoDoTipo, amostragemDoTipo } from "@/lib/pit-escopo";
import PlpPainel from "./PlpPainel";
import { tipoDoProduto, camposDoRelatorioPintura } from "@/lib/plp";
import { GRAUS_LIMPEZA, GRAUS_INTEMPERISMO, TEMPO, CAMPOS_DEMAO, RUGOSIDADE_MIN, RUGOSIDADE_MAX, mediaRugosidade, mediaEspessura, condicoesPermitemPintar } from "@/lib/pintura-campos";

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
  const [plp, setPlp] = useState(null);
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

  // ─── O QUE FOI APLICADO SE ESCOLHE, NÃO SE DIGITA ─────────────────────────────────────────────
  //
  // Vitor (22/08/2026): "aqui você vai precisar deixar selecionável também, pois temos peças que
  // são de cores diferentes — o ideal seria criarmos a seleção e o Inspetor seleciona na hora o
  // que foi aplicado". E: "era bom trazer todas as tintas recebidas da OP em questão".
  //
  // Produto e os três lotes saem do CMR (tudo que a obra recebeu, já separado em base,
  // endurecedor e diluente); a cor sai do PLP. Escolher o lote preenche a validade junto — ela
  // está no mesmo lançamento e digitá-la à mão é erro de transcrição esperando acontecer.
  const porComponente = (c) => tintas.filter((t) => t.componente === c);
  const cores = [...new Set([
    ...((plp?.itens || []).map((i) => i.cor)),
    ...((plp?.demaos || []).map((d) => d.cor)),
  ].filter(Boolean))];

  const CAMPO_LOTE = { loteA: { comp: "A", val: "valA" }, loteB: { comp: "B", val: "valB" }, loteD: { comp: "D", val: "valD" } };

  // ⚠ O QUE O PLP DIZ APARECE MESMO SEM CLIQUE. Vitor (22/08/2026): "qual a espessura que
  // fala no PLP, você precisa trazer essa informação aqui também". O campo é do relatório
  // (documento controlado, gravado na criação), mas deixá-lo em branco quando o plano da
  // obra tem a resposta obriga o inspetor a procurar em outro lugar. Então o valor do PLP
  // vira a dica do campo — e o "Preencher" do painel é que grava.
  const doPlp = plp ? camposDoRelatorioPintura(plp) : {};

  // ⚠⚠ UM DEMÃO USA MAIS DE UM LOTE. Vitor (04/09/2026): "no preenchimento do lote da tinta você
  // não permite colocar vários números de uma vez". Duas latas do mesmo componente numa demão é o
  // normal, e o seletor trocava o lote anterior em vez de somar — quem tentava registrar os dois
  // ficava digitando por cima do próprio registro.
  //
  // ⚠ A VALIDADE ANDA JUNTO, na mesma ordem: lote e validade viram listas paralelas, senão não se
  // sabe qual validade é de qual lata.
  const partes = (v) => String(v || "").split("·").map((x) => x.trim()).filter(Boolean);
  const juntar = (a2) => a2.join(" · ");

  function escolherLote(n, k, idTinta) {
    const t = tintas.find((x) => x.id === idTinta);
    const cfg = CAMPO_LOTE[k];
    const bloco = { ...(dem[n] || {}) };
    if (!t) { setResultado("demaos", { ...dem, [n]: bloco }); return; }
    const lotes = partes(bloco[k]);
    const vals = partes(bloco[cfg.val]);
    const novoLote = t.lote || "";
    if (novoLote && !lotes.includes(novoLote)) {
      lotes.push(novoLote);
      // ⚠ a lista de validades acompanha por POSIÇÃO — "—" quando o CMR não tem a data, para as
      // duas listas continuarem alinhadas.
      vals.push(t.validade ? String(t.validade).slice(0, 10) : "—");
      bloco[k] = juntar(lotes);
      bloco[cfg.val] = juntar(vals);
    }
    {
      // a base manda no produto e no fabricante do relatório
      // no campo Produto vai o TIPO, sem a cor — ela tem campo próprio
      if (cfg.comp === "A") { bloco.produto = t.tipo || t.produto; if (t.fabricante) bloco.fabricante = t.fabricante; }
    }
    setResultado("demaos", { ...dem, [n]: bloco });
  }

  /** As opções deste campo, ou null quando ele continua sendo texto livre. */
  function opcoesDoCampo(k) {
    if (k === "cor") return cores.length ? cores : null;
    if (k === "produto") {
      const doCmr = [...new Set(porComponente("A").map((t) => t.tipo || t.produto))];
      const doPlp = (plp?.demaos || []).map((d) => tipoDoProduto(d.produto)).filter(Boolean);
      const todos = [...new Set([...doCmr, ...doPlp])];
      return todos.length ? todos : null;
    }
    return null;
  }
  const setEsp = (n, i, v) => {
    const atual = Array.isArray(esp[n]) ? [...esp[n]] : ["", "", "", "", ""];
    atual[i] = v;
    setResultado("espessuras", { ...esp, [n]: atual });
  };
  const setRug = (i, v) => { const a = [...rug]; a[i] = v; setResultado("rugLeituras", a); };

  // ⚠⚠ N/A É RESPOSTA, VAZIO NÃO É. Vitor (04/09/2026): "o teste de salinidade não tem campo para
  // podermos informar número ou N/A, e Pull-off precisamos ter que colocar N/A". Campo em branco
  // num relatório assinado é ambíguo — não se sabe se o ensaio não se aplicava ou se esqueceram.
  // "N/A" é o inspetor dizendo que conferiu e não se aplica.
  const Campo = ({ rot, k, tipo = "text", opcoes = null, largura = "", na = false }) => (
    <label className={`block ${largura}`}>
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-torg-gray mb-0.5">
        <span>{rot}</span>
        {na && !travado && (
          <button type="button" onClick={() => setResultado(k, res[k] === "N/A" ? "" : "N/A")}
            title={res[k] === "N/A" ? "voltar a preencher" : "marcar como não aplicável"}
            className={`ml-auto text-[9px] px-1.5 py-0.5 rounded border font-bold ${
              res[k] === "N/A" ? "bg-torg-dark text-white border-torg-dark" : "border-gray-200 text-torg-gray hover:border-torg-blue"}`}>
            N/A
          </button>
        )}
      </span>
      {opcoes ? (
        <select value={res[k] || ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue disabled:bg-gray-50">
          <option value="">—</option>
          {opcoes.map((o) => <option key={o.id || o} value={o.id || o}>{o.nome || o}</option>)}
        </select>
      ) : (
        <input type={res[k] === "N/A" ? "text" : tipo} value={res[k] ?? ""} disabled={travado || res[k] === "N/A"}
          onChange={(e) => setResultado(k, e.target.value)}
          placeholder={doPlp[k] != null && typeof doPlp[k] !== "object" ? String(doPlp[k]) : ""}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
      )}
      {/* a dica só aparece enquanto o campo está vazio: depois de preenchido ela seria ruído */}
      {doPlp[k] != null && typeof doPlp[k] !== "object" && (res[k] === undefined || res[k] === null || res[k] === "") && (
        <span className="block text-[10px] text-torg-blue mt-0.5">PLP: {String(doPlp[k])}</span>
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
      <PlpPainel opNumero={rel.opNumero} podeEditar={!travado} onTintas={setTintas} onPlp={setPlp} res={res} setResultado={travado ? null : setResultado} />

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
          {/* ⚠ SEMPRE NA TELA, com N/A. Antes sumiam quando o PIT não pedia — e o inspetor que
              media assim mesmo não tinha onde escrever, nem havia como registrar que não se
              aplicava. O escopo do PIT vira DICA, não portão. */}
          <Campo rot={`Poeira (ISO 8502-3)${esc.poeira ? "" : " · fora do PIT"}`} k="poeira" na />
          <Campo rot={`Salinidade — Bresle (ISO 8502-6/9)${esc.salinidade ? "" : " · fora do PIT"}`} k="salinidade" na />
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
                {["1", "2", "3"].map((n) => {
                  const dyn = opcoesDoCampo(k);
                  const lote = CAMPO_LOTE[k];
                  const listaLote = lote ? porComponente(lote.comp) : [];
                  return (
                  <td key={n} className="py-1 px-0.5">
                    {lote && listaLote.length ? (
                      // ⚠ o valor guardado é o LOTE (texto), nunca o id do documento: amarrar ao
                      // registro do CMR quebraria o relatório na próxima reimportação.
                      <div className="space-y-0.5">
                        {partes(dem[n]?.[k]).length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {partes(dem[n]?.[k]).map((lt, i) => (
                              <span key={`${lt}-${i}`} className="inline-flex items-center gap-0.5 text-[10px] bg-torg-blue-50 text-torg-blue border border-torg-blue-100 rounded px-1">
                                {lt}
                                {!travado && (
                                  <button type="button" title="tirar este lote"
                                    onClick={() => {
                                      const bloco = { ...(dem[n] || {}) };
                                      const ls = partes(bloco[k]); const vs = partes(bloco[lote.val]);
                                      ls.splice(i, 1); vs.splice(i, 1);
                                      bloco[k] = juntar(ls); bloco[lote.val] = juntar(vs);
                                      setResultado("demaos", { ...dem, [n]: bloco });
                                    }}
                                    className="text-torg-gray hover:text-red-600 leading-none">×</button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        <select value="" disabled={travado}
                          onChange={(e) => { escolherLote(n, k, e.target.value); e.target.value = ""; }}
                          className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50">
                          <option value="">+ lote…</option>
                          {listaLote.map((t) => (
                            <option key={t.id} value={t.id}>{t.lote ? `${t.lote} · ` : ""}{t.produto}</option>
                          ))}
                        </select>
                      </div>
                    ) : (opcoes || dyn) ? (
                      <select value={dem[n]?.[k] || ""} disabled={travado} onChange={(e) => setDemao(n, k, e.target.value)}
                        className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50">
                        <option value="">—</option>
                        {(opcoes || dyn).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={tipo || "text"} value={dem[n]?.[k] ?? ""} disabled={travado} onChange={(e) => setDemao(n, k, e.target.value)}
                        className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50" />
                    )}
                  </td>
                  );
                })}
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

      {/* ── pull-off ─────────────────────────────────────────────────────────────────
          ⚠ O BLOCO NÃO SOME MAIS quando o PIT não pede. Vitor (04/09/2026): "Pull-off precisamos
          ter que colocar N/A". Esconder impedia as duas coisas: registrar o ensaio feito por fora
          do PIT e registrar que ele não se aplicava. */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">
          Aderência — pull-off
          {!esc.pullOff && <span className="ml-1.5 text-[10px] font-normal text-torg-gray">· fora do PIT desta obra</span>}
        </p>
        <div className="grid sm:grid-cols-4 gap-2.5">
          <Campo rot="Equipamento" k="pullOffEquip" na />
          <Campo rot="Valor obtido (MPa)" k="pullOffValor" tipo="number" na />
          <Campo rot="Mínimo exigido (MPa)" k="pullOffMin" tipo="number" na />
          <Campo rot="Tipo de ruptura" k="pullOffRuptura" na />
        </div>
      </div>
    </div>
  );
}

/**
 * As condições ambientais, com a verificação do item 5.4.
 *
 * ⚠ Separado em componente porque é o bloco que MUDA a decisão: o resto da tela registra, este
 * julga. Ele diz, com a regra na mão, se a aplicação era permitida — e nomeia o impedimento.
 */
function CondicoesAmbientais({ res, travado: _travado, setResultado: _setResultado, Campo }) {
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
