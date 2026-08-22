"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Paintbrush } from "lucide-react";
import {
  GRAUS_LIMPEZA, GRAUS_INTEMPERISMO, TEMPO,
  RUGOSIDADE_MIN, RUGOSIDADE_MAX, mediaRugosidade, mediaEspessura, condicoesPermitemPintar,
} from "@/lib/pintura-campos";

// ─── PINTURA NO CELULAR ───────────────────────────────────────────────────────
// Vitor (22/08/2026): "ajuste a tela de pintura no portal de campo, deixa tudo
// alinhado".
//
// Até aqui o celular só separava dimensional e ultrassom; a pintura caía nos
// controles do EVS e o inspetor via descontinuidade, soldador e EPS num relatório de
// pintura. Justamente o ensaio que mais precisa do celular: quem mede DFT, ponto de
// orvalho e rugosidade está na frente da peça, não na mesa.
//
// ⚠ SÓ O QUE SE MEDE. O especificado (abrasivo, faixa de rugosidade, espessura mínima,
// produto e fabricante de cada demão) vem do PLP e já está gravado no relatório —
// aparece aqui em CINZA, para conferência, e não em campo editável. Pré-preencher
// medição é fabricar registro; deixar o especificado editável no galpão é deixar o
// plano da obra ser reescrito na beira do jato.

const DEMAOS = ["1", "2", "3"];

export default function Pintura({ cond, setCond, tintas = [], plp = null }) {
  const [aba, setAba] = useState("1");
  const set = (k, v) => setCond((c) => ({ ...c, [k]: v }));

  const rug = Array.isArray(cond.rugLeituras) ? cond.rugLeituras : ["", "", "", "", ""];
  const esp = cond.espessuras || {};
  const dem = cond.demaos || {};

  const setRug = (i, v) => { const a = [...rug]; a[i] = v; set("rugLeituras", a); };
  const setEsp = (d, i, v) => {
    const atual = Array.isArray(esp[d]) ? [...esp[d]] : ["", "", "", "", ""];
    atual[i] = v;
    set("espessuras", { ...esp, [d]: atual });
  };
  const setDem = (d, k, v) => set("demaos", { ...dem, [d]: { ...(dem[d] || {}), [k]: v } });

  // ⚠ O QUE FOI APLICADO SE ESCOLHE. Vitor (22/08/2026): "temos peças que são de cores
  // diferentes — o Inspetor seleciona na hora o que foi aplicado"; "era bom trazer todas
  // as tintas recebidas da OP em questão". A tinta chega em trio (base, endurecedor,
  // diluente), cada um com o próprio lote — por isso são três seletores, e escolher um
  // traz a validade junto.
  const porComp = (c) => tintas.filter((t) => t.componente === c);
  const cores = [...new Set([
    ...((plp?.itens || []).map((i) => i.cor)),
    ...((plp?.demaos || []).map((x) => x.cor)),
  ].filter(Boolean))];

  function escolherLote(campo, campoVal, comp, id) {
    const t = porComp(comp).find((x) => x.id === id);
    const bloco = { ...(dem[aba] || {}) };
    if (!t) { bloco[campo] = ""; bloco[campoVal] = ""; }
    else {
      bloco[campo] = t.lote || "";
      if (t.validade) bloco[campoVal] = String(t.validade).slice(0, 10);
      // Produto recebe o TIPO, sem a cor — ela tem campo próprio logo abaixo
      if (comp === "A") { bloco.produto = t.tipo || t.produto; if (t.fabricante) bloco.fabricante = t.fabricante; }
    }
    set("demaos", { ...dem, [aba]: bloco });
  }

  const SelLote = ({ rot, campo, campoVal, comp }) => {
    const lista = porComp(comp);
    if (!lista.length) return <Txt rot={rot} v={dem[aba]?.[campo]} onMudar={(v) => setDem(aba, campo, v)} />;
    // o valor guardado é o LOTE; o seletor casa por ele para reabrir marcado
    const atual = lista.find((t) => t.lote === dem[aba]?.[campo])?.id || "";
    return (
      <Sel rot={rot} v={atual} onMudar={(v) => escolherLote(campo, campoVal, comp, v)}
        opcoes={lista.map((t) => ({ v: t.id, t: `${t.lote ? `${t.lote} · ` : ""}${t.produto}` }))} />
    );
  };

  const mRug = mediaRugosidade(rug);
  const rugFora = mRug != null && (mRug < RUGOSIDADE_MIN || mRug > RUGOSIDADE_MAX);

  // ⚠ O CORAÇÃO DA TELA. O item 5.4 do PO-05 é explícito e cada regra é verificável:
  // ambiente ≥ 5 °C, superfície 3 °C acima do orvalho, superfície ≤ 52 °C, umidade ≤ 85%,
  // sem chuva/nevoeiro/bruma. Pintar fora disso é a causa clássica de falha de
  // revestimento — parece boa no dia e descola meses depois, na obra do cliente.
  const amb = condicoesPermitemPintar({
    tAmbiente: cond.prepTAmb, tSuperficie: cond.prepTSup,
    pontoOrvalho: cond.prepOrvalho, umidade: cond.prepUmidade, tempo: cond.tempo,
  });

  const espec = cond.__espec || {};

  return (
    <div className="mt-3 space-y-4">
      {/* o que o PLP mandou — conferência, não edição */}
      {(espec.abrasivo || espec.rugEspec || espec.espessuraMinima || espec.prepProcedimento) && (
        <div className="rounded-xl bg-gray-100 px-3 py-2">
          <p className="text-[11px] font-semibold text-torg-gray inline-flex items-center gap-1.5">
            <Paintbrush size={12} /> Especificado no PLP
          </p>
          <div className="text-[12px] text-torg-dark mt-1 space-y-0.5">
            {espec.prepProcedimento && <p>Preparo: <strong>{espec.prepProcedimento}</strong></p>}
            {espec.abrasivo && <p>Abrasivo: <strong>{espec.abrasivo}</strong></p>}
            {espec.rugEspec && <p>Rugosidade: <strong>{espec.rugEspec}</strong></p>}
            {espec.espessuraMinima && <p>Espessura mínima: <strong>{espec.espessuraMinima} µm</strong></p>}
          </div>
        </div>
      )}

      {/* ── PREPARAÇÃO ─────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Preparação de superfície</p>
        <div className="space-y-2.5">
          <Sel rot="Grau de limpeza obtido" v={cond.limpeza} onMudar={(v) => set("limpeza", v)}
            opcoes={GRAUS_LIMPEZA.map((g) => ({ v: g.id, t: g.nome }))} />
          <Sel rot="Grau de intemperismo" v={cond.intemperismo} onMudar={(v) => set("intemperismo", v)}
            opcoes={GRAUS_INTEMPERISMO.map((g) => ({ v: g, t: g }))} />
          <div className="grid grid-cols-3 gap-2">
            <Txt rot="Data" tipo="date" v={cond.prepData} onMudar={(v) => set("prepData", v)} />
            <Txt rot="Início" tipo="time" v={cond.prepIni} onMudar={(v) => set("prepIni", v)} />
            <Txt rot="Fim" tipo="time" v={cond.prepFim} onMudar={(v) => set("prepFim", v)} />
          </div>

          <div>
            <p className="text-[12px] text-torg-gray mb-1">
              Rugosidade — 5 leituras (µm) · faixa {RUGOSIDADE_MIN}–{RUGOSIDADE_MAX}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {rug.map((v, i) => (
                <input key={i} type="number" inputMode="decimal" value={v ?? ""} onChange={(e) => setRug(i, e.target.value)}
                  className="w-full text-base font-mono text-center border-2 border-gray-200 rounded-xl py-2.5 focus:border-torg-blue outline-none" />
              ))}
            </div>
            {mRug != null && (
              <p className={`text-center text-[13px] mt-1 font-semibold ${rugFora ? "text-red-600" : "text-emerald-700"}`}>
                média {mRug} µm {rugFora ? "· fora da faixa do PO-05" : "· dentro"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── CONDIÇÕES AMBIENTAIS ───────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Condições ambientais</p>
        <div className="grid grid-cols-2 gap-2">
          <Txt rot="Temp. ambiente (°C)" tipo="number" v={cond.prepTAmb} onMudar={(v) => set("prepTAmb", v)} />
          <Txt rot="Temp. superfície (°C)" tipo="number" v={cond.prepTSup} onMudar={(v) => set("prepTSup", v)} />
          <Txt rot="Ponto de orvalho (°C)" tipo="number" v={cond.prepOrvalho} onMudar={(v) => set("prepOrvalho", v)} />
          <Txt rot="Umidade relativa (%)" tipo="number" v={cond.prepUmidade} onMudar={(v) => set("prepUmidade", v)} />
        </div>
        <div className="mt-2">
          <Sel rot="Tempo" v={cond.tempo} onMudar={(v) => set("tempo", v)} opcoes={TEMPO.map((t) => ({ v: t, t }))} />
        </div>

        {amb.avaliado && (
          <div className={`mt-2 rounded-xl px-3 py-2.5 ${amb.permitido ? "bg-emerald-50 border-2 border-emerald-300" : "bg-red-50 border-2 border-red-300"}`}>
            <p className={`text-[13px] font-bold inline-flex items-center gap-1.5 ${amb.permitido ? "text-emerald-800" : "text-red-700"}`}>
              {amb.permitido ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {amb.permitido ? "Condições permitem pintar" : "NÃO PODE PINTAR"}
            </p>
            {!amb.permitido && (
              <ul className="text-[12px] text-red-700 mt-1 space-y-0.5">
                {amb.impedimentos.map((im, i) => <li key={i}>· {im}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── DEMÃOS ─────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Aplicação das tintas</p>
        {/* uma demão por vez: as três lado a lado no celular viram tabela ilegível */}
        <div className="flex gap-1.5 mb-2">
          {DEMAOS.map((d) => (
            <button key={d} onClick={() => setAba(d)}
              className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold border-2 ${
                aba === d ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-dark border-gray-200"}`}>
              {d}ª demão
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <SelLote rot="Tinta (base) — lote" campo="loteA" campoVal="valA" comp="A" />
          <SelLote rot="Endurecedor — lote" campo="loteB" campoVal="valB" comp="B" />
          <SelLote rot="Diluente — lote" campo="loteD" campoVal="valD" comp="D" />

          {dem[aba]?.produto && (
            <p className="text-[12px] text-torg-gray -mt-1">
              Tinta: <strong className="text-torg-dark">{dem[aba].produto}</strong>
              {dem[aba]?.fabricante ? ` · ${dem[aba].fabricante}` : ""}
            </p>
          )}

          {cores.length > 0
            ? <Sel rot="Cor aplicada" v={dem[aba]?.cor} onMudar={(v) => setDem(aba, "cor", v)}
                opcoes={cores.map((c) => ({ v: c, t: c }))} />
            : <Txt rot="Cor aplicada" v={dem[aba]?.cor} onMudar={(v) => setDem(aba, "cor", v)} />}

          <div className="grid grid-cols-2 gap-2">
            <Txt rot="Data de aplicação" tipo="date" v={dem[aba]?.data} onMudar={(v) => setDem(aba, "data", v)} />
            <Txt rot="Horário" tipo="time" v={dem[aba]?.hIni} onMudar={(v) => setDem(aba, "hIni", v)} />
          </div>

          <div>
            <p className="text-[12px] text-torg-gray mb-1">
              Espessura seca — 5 leituras (µm){espec.espessuraMinima ? ` · mínimo ${espec.espessuraMinima}` : ""}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {(Array.isArray(esp[aba]) ? esp[aba] : ["", "", "", "", ""]).map((v, i) => {
                const min = Number(espec.espessuraMinima);
                // ⚠ o PO-05 item 5.5.3.1 é literal: "nenhuma medição pode ser inferior à espessura
                // mínima definida no PLP" — por isso a leitura acende sozinha, uma a uma.
                const baixa = Number.isFinite(min) && min > 0 && v !== "" && v != null && Number(v) < min;
                return (
                  <input key={i} type="number" inputMode="decimal" value={v ?? ""} onChange={(e) => setEsp(aba, i, e.target.value)}
                    className={`w-full text-base font-mono text-center border-2 rounded-xl py-2.5 outline-none ${
                      baixa ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 focus:border-torg-blue"}`} />
                );
              })}
            </div>
            {mediaEspessura(esp[aba]) != null && (
              <p className="text-center text-[13px] mt-1 font-semibold text-torg-dark">
                média {mediaEspessura(esp[aba])} µm
              </p>
            )}
          </div>

          <Txt rot="Aderência (ensaio X)" v={dem[aba]?.aderencia} onMudar={(v) => setDem(aba, "aderencia", v)} />
          <Txt rot="Inspeção visual" v={dem[aba]?.visual} onMudar={(v) => setDem(aba, "visual", v)} />
        </div>
      </div>
    </div>
  );
}

// ── controles no tamanho do dedo, iguais aos do resto do portal de campo ──
function Txt({ rot, v, onMudar, tipo = "text" }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
      <input type={tipo} inputMode={tipo === "number" ? "decimal" : undefined} value={v ?? ""}
        onChange={(e) => onMudar(e.target.value)}
        className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none" />
    </label>
  );
}

function Sel({ rot, v, opcoes, onMudar }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
      <select value={v ?? ""} onChange={(e) => onMudar(e.target.value)}
        className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
        <option value="">—</option>
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );
}
