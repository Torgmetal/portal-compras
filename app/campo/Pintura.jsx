"use client";
import { useState } from "react";
import { useComponenteEstavel } from "@/lib/react-estavel";
import { Txt, TxtNA, Sel } from "./controles";
import { CamposAmbiente, Veredito } from "./PinturaAmbiente";
import { Paintbrush } from "lucide-react";
import {
  GRAUS_LIMPEZA, GRAUS_INTEMPERISMO, TEMPO, METODOS_APLICACAO, ETAPAS_AMBIENTE, CAMPO_DO_JATO,
  RUGOSIDADE_MIN, RUGOSIDADE_MAX, mediaRugosidade, mediaEspessura, condicoesPermitemPintar,
  leiturasAmbientais,
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
// Vitor (11/09/2026): padrões por OP, mantendo alternativas selecionáveis.
// Grau de limpeza, abrasivo e escolhas das demãos são editáveis e lembrados ao salvar.
// Limites especificados continuam visíveis para conferência; medições nascem vazias.

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

  // ⚠⚠ UMA DEMÃO USA MAIS DE UM LOTE. Vitor (04/09/2026): "no preenchimento do lote da tinta você
  // não permite colocar vários números de uma vez". Duas latas do mesmo componente numa demão é o
  // normal, e o seletor TROCAVA o lote anterior — quem tentava registrar as duas ficava digitando
  // por cima do próprio registro. Agora o seletor ACRESCENTA, e cada lote vira um chip.
  //
  // ⚠ A VALIDADE ANDA JUNTO, na mesma ordem: lote e validade são listas paralelas, senão não se
  // sabe qual validade é de qual lata. "—" quando o CMR não tem a data, para não desalinhar.
  const partes = (v) => String(v || "").split("·").map((x) => x.trim()).filter(Boolean);
  const juntar = (a) => a.join(" · ");

  function somarLote(campo, campoVal, comp, id) {
    const t = porComp(comp).find((x) => x.id === id);
    if (!t) return;
    const bloco = { ...(dem[aba] || {}) };
    const lotes = partes(bloco[campo]);
    const vals = partes(bloco[campoVal]);
    const novo = t.lote || "";
    if (novo && !lotes.includes(novo)) {
      lotes.push(novo);
      vals.push(t.validade ? String(t.validade).slice(0, 10) : "—");
      bloco[campo] = juntar(lotes);
      bloco[campoVal] = juntar(vals);
    }
    // Produto recebe o TIPO, sem a cor — ela tem campo próprio logo abaixo
    if (comp === "A") { bloco.produto = t.tipo || t.produto; if (t.fabricante) bloco.fabricante = t.fabricante; }
    set("demaos", { ...dem, [aba]: bloco });
  }

  function tirarLote(campo, campoVal, i) {
    const bloco = { ...(dem[aba] || {}) };
    const lotes = partes(bloco[campo]); const vals = partes(bloco[campoVal]);
    lotes.splice(i, 1); vals.splice(i, 1);
    bloco[campo] = juntar(lotes); bloco[campoVal] = juntar(vals);
    set("demaos", { ...dem, [aba]: bloco });
  }

  const SelLote = useComponenteEstavel(({ rot, campo, campoVal, comp }) => {
    const lista = porComp(comp);
    const lotes = partes(dem[aba]?.[campo]);
    return (
      <div>
        <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
        {lotes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {lotes.map((lt, i) => (
              <span key={`${lt}-${i}`} className="inline-flex items-center gap-1.5 text-[13px] bg-torg-blue/10 text-torg-blue border border-torg-blue/30 rounded-xl px-2.5 py-1.5">
                {lt}
                <button type="button" onClick={() => tirarLote(campo, campoVal, i)} className="font-bold px-0.5 active:text-red-600">×</button>
              </span>
            ))}
          </div>
        )}
        {lista.length ? (
          <select value="" onChange={(e) => { somarLote(campo, campoVal, comp, e.target.value); e.target.value = ""; }}
            className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
            <option value="">+ lote…</option>
            {lista.map((t) => <option key={t.id} value={t.id}>{t.lote ? `${t.lote} · ` : ""}{t.produto}</option>)}
          </select>
        ) : (
          // sem tinta no CMR da obra, digita — mas continua sendo lista: separe por " · "
          <input value={dem[aba]?.[campo] ?? ""} onChange={(e) => setDem(aba, campo, e.target.value)}
            placeholder="lote 1 · lote 2"
            className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none" />
        )}
        <label className="block mt-1.5">
          <span className="block text-[11px] text-torg-gray mb-1">Validade{lotes.length > 1 ? " (na ordem dos lotes)" : ""}</span>
          <input value={dem[aba]?.[campoVal] ?? ""} onChange={(e) => setDem(aba, campoVal, e.target.value)}
            placeholder="aaaa-mm-dd"
            className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:border-torg-blue outline-none" />
        </label>
      </div>
    );
  });

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

  // a leitura desta demão (a dela, ou a herdada do jato) e o julgamento do item 5.4 sobre ELA
  const ambDemao = leiturasAmbientais(cond, aba);
  const ambientePermitido = condicoesPermitemPintar({
    tAmbiente: ambDemao.tAmb, tSuperficie: ambDemao.tSup,
    pontoOrvalho: ambDemao.orvalho, umidade: ambDemao.umidade, tempo: ambDemao.tempo,
  });

  const espec = cond.__espec || {};
  // ⚠ o mínimo que JULGA a leitura é o do relatório; o do PLP fica de referência ao lado do campo
  const minEspessura = cond.espessuraMinima ?? espec.espessuraMinima ?? "";

  return (
    <div className="mt-3 space-y-4">
      {/* o que o PLP mandou — conferência, não edição */}
      {(espec.abrasivo || espec.rugEspec || espec.espessuraMinima || espec.prepProcedimento) && (
        <div className="rounded-xl bg-gray-100 px-3 py-2">
          <p className="text-[11px] font-semibold text-torg-gray inline-flex items-center gap-1.5">
            <Paintbrush size={12} /> Referência na criação do relatório
          </p>
          <div className="text-[12px] text-torg-dark mt-1 space-y-0.5">
            {espec.prepProcedimento && <p>Preparo: <strong>{espec.prepProcedimento}</strong></p>}
            {espec.abrasivo && <p>Abrasivo: <strong>{espec.abrasivo}</strong></p>}
            {espec.rugEspec && <p>Rugosidade: <strong>{espec.rugEspec}</strong></p>}
            {espec.espessuraMinima && <p>Espessura mínima da obra: <strong>{espec.espessuraMinima} µm</strong></p>}
          </div>
        </div>
      )}

      {/* ── PREPARAÇÃO ─────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Preparação de superfície</p>
        <div className="space-y-2.5">
          <Sel rot="Grau de limpeza obtido" v={cond.limpeza} onMudar={(v) => set("limpeza", v)}
            opcoes={GRAUS_LIMPEZA.map((g) => ({ v: g.id, t: g.nome }))} />
          <Txt rot="Abrasivo" v={cond.abrasivo} onMudar={(v) => set("abrasivo", v)} />
          <Sel rot="Grau de intemperismo" v={cond.intemperismo} onMudar={(v) => set("intemperismo", v)}
            opcoes={GRAUS_INTEMPERISMO.map((g) => ({ v: g, t: g }))} />
          <div className="grid grid-cols-3 gap-2">
            <Txt rot="Data do preparo" tipo="date" v={cond.prepData} onMudar={(v) => set("prepData", v)} />
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

          {/* ⚠⚠ N/A É RESPOSTA, VAZIO NÃO É. Vitor (04/09/2026): "o teste de salinidade não tem
              campo para podermos informar número ou N/A, e pull-off precisamos ter que colocar
              N/A". Os dois ensaios nem existiam nesta tela — quem media no galpão não tinha onde
              registrar, e campo em branco não distingue "não se aplica" de "esqueceram". */}
          <TxtNA rot="Poeira (ISO 8502-3)" v={cond.poeira} onMudar={(v) => set("poeira", v)} />
          <TxtNA rot="Salinidade — Bresle (ISO 8502-6/9)" v={cond.salinidade} onMudar={(v) => set("salinidade", v)} />
        </div>
      </div>

      {/* ── CONDIÇÕES AMBIENTAIS DO JATEAMENTO ─────────────────────────────────
          ⚠⚠ ESTE BLOCO É DO JATO, e por anos foi o único. Vitor (22/09/2026): "precisas que tenha
          o campo para informarmos tanto no jato, quanto no fundo quanto nas demais demãos". Sem o
          rótulo, esta leitura era tratada como "a do relatório" e copiada para as três demãos —
          três medições que ninguém fez. Cada demão agora tem o bloco dela, na aba dela. */}
      <fieldset className="rounded-xl border-2 border-gray-100 p-3">
        <legend className="px-1 text-[13px] font-semibold text-torg-dark">Condições ambientais · no jateamento</legend>
        <CamposAmbiente valores={leiturasAmbientais(cond, "jato")} onMudar={(k, v) => set(CAMPO_DO_JATO[k], v)} />
        <div className="mt-2">
          <Sel rot="Tempo" v={cond.tempo} onMudar={(v) => set("tempo", v)} opcoes={TEMPO.map((t) => ({ v: t, t }))} />
        </div>

        <Veredito amb={amb} />
      </fieldset>

      {/* ── DEMÃOS ─────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Aplicação das tintas</p>
        {/* uma demão por vez: as três lado a lado no celular viram tabela ilegível */}
        <div className="flex gap-1.5 mb-2">
          {DEMAOS.map((d) => (
            <button key={d} type="button" aria-pressed={aba === d} onClick={() => setAba(d)}
              className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold border-2 ${
                aba === d ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-dark border-gray-200"}`}>
              {d}ª demão
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <fieldset className="rounded-xl border-2 border-torg-blue/20 bg-torg-blue/5 p-3">
            <legend className="px-1 text-[13px] font-semibold text-torg-dark">Data e horários da {aba}ª demão</legend>
            <p className="text-[12px] text-torg-gray mb-2">Registre a aplicação desta demão. Cada aba guarda sua própria data e horários.</p>
            <Txt rot="Data de aplicação" tipo="date" v={dem[aba]?.data} onMudar={(v) => setDem(aba, "data", v)} />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Txt rot="Horário inicial" tipo="time" v={dem[aba]?.hIni} onMudar={(v) => setDem(aba, "hIni", v)} />
              <Txt rot="Horário final" tipo="time" v={dem[aba]?.hFim} onMudar={(v) => setDem(aba, "hFim", v)} />
            </div>
          </fieldset>

          {/* ── A CONDIÇÃO AMBIENTAL DESTA DEMÃO ──────────────────────────────────
              ⚠⚠ ATÉ AQUI SÓ O JATO TINHA CAMPO, e o documento copiava a leitura dele nas três
              colunas. Cada demão é outro dia — às vezes outro turno: o fundo do RIP-102-002 foi na
              tarde do dia 17 e a 2ª demão na manhã do 18, e as três diziam 41% / 24 °C / 23 °C.
              ⚠ O campo mostra o que ESTA demão tem, nunca o valor herdado: preenchido com a leitura
              do jato, um toque em salvar transformaria a herança em medição. */}
          <fieldset className="rounded-xl border-2 border-torg-blue/20 bg-torg-blue/5 p-3">
            <legend className="px-1 text-[13px] font-semibold text-torg-dark">
              Condições ambientais · {ETAPAS_AMBIENTE.find((e) => e.id === aba)?.curto || `${aba}ª demão`}
            </legend>
            <CamposAmbiente valores={dem[aba] || {}} onMudar={(k, v) => setDem(aba, k, v)} />
            {ambDemao.herdado && (
              <p className="text-[12px] text-amber-700 mt-2 leading-tight">
                Sem leitura desta demão: o relatório vai sair com a do jateamento
                ({[cond.prepUmidade && `${cond.prepUmidade}%`, cond.prepTAmb && `${cond.prepTAmb} °C`].filter(Boolean).join(" · ")}).
              </p>
            )}
            <Veredito amb={ambientePermitido} />
          </fieldset>
          <SelLote rot="Tinta (base) — lote" campo="loteA" campoVal="valA" comp="A" />
          <SelLote rot="Endurecedor — lote" campo="loteB" campoVal="valB" comp="B" />
          <SelLote rot="Diluente — lote" campo="loteD" campoVal="valD" comp="D" />

          <Txt rot="Produto / norma" v={dem[aba]?.produto} onMudar={(v) => setDem(aba, "produto", v)} />
          <Txt rot="Fabricante" v={dem[aba]?.fabricante} onMudar={(v) => setDem(aba, "fabricante", v)} />
          <Sel rot="Método de aplicação" v={dem[aba]?.metodo} onMudar={(v) => setDem(aba, "metodo", v)} opcoes={METODOS_APLICACAO.map(t => ({ v: t, t }))} />

          {cores.length > 0
            ? <Sel rot="Cor aplicada" v={dem[aba]?.cor} onMudar={(v) => setDem(aba, "cor", v)}
                opcoes={cores.map((c) => ({ v: c, t: c }))} />
            : <Txt rot="Cor aplicada" v={dem[aba]?.cor} onMudar={(v) => setDem(aba, "cor", v)} />}


          {/* ── A MICRAGEM SECA MÍNIMA, ABERTA ──────────────────────────────────
              ⚠⚠ ELA NASCE DO PLP E NÃO SERVE PARA TODA PEÇA. Vitor (22/09/2026): "deixe o campo de
              micragem seca aberto para ajustar, pois temos espessuras diferentes para cada
              relatórios às vezes e hoje um deles está dando como reprovado". O PLP traz UM número
              por obra (a soma das demãos) e a tela acendia vermelho contra ele — a peça de outro
              esquema media certo e parecia reprovada.
              ⚠ Ajustar aqui muda ESTE relatório, nunca o PLP: o plano da obra é outro documento. */}
          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">
              Micragem seca mínima (µm){espec.espessuraMinima ? ` · PLP da obra: ${espec.espessuraMinima}` : ""}
            </span>
            <input type="number" inputMode="decimal" value={cond.espessuraMinima ?? ""}
              placeholder={espec.espessuraMinima ? String(espec.espessuraMinima) : ""}
              onChange={(e) => set("espessuraMinima", e.target.value)}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none" />
          </label>

          <div>
            <p className="text-[12px] text-torg-gray mb-1">
              Espessura seca — 5 leituras (µm){minEspessura ? ` · mínimo ${minEspessura}` : ""}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {(Array.isArray(esp[aba]) ? esp[aba] : ["", "", "", "", ""]).map((v, i) => {
                const min = Number(minEspessura);
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

      {/* ── ADERÊNCIA PULL-OFF ─────────────────────────────────────────────────
          Vale para o relatório, não para a demão: é um ensaio do esquema pronto. */}
      <div>
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Aderência — pull-off</p>
        <div className="space-y-2.5">
          <TxtNA rot="Equipamento" v={cond.pullOffEquip} onMudar={(v) => set("pullOffEquip", v)} />
          <div className="grid grid-cols-2 gap-2">
            <TxtNA rot="Valor obtido (MPa)" tipo="number" v={cond.pullOffValor} onMudar={(v) => set("pullOffValor", v)} />
            <TxtNA rot="Mínimo exigido (MPa)" tipo="number" v={cond.pullOffMin} onMudar={(v) => set("pullOffMin", v)} />
          </div>
          <TxtNA rot="Tipo de ruptura" v={cond.pullOffRuptura} onMudar={(v) => set("pullOffRuptura", v)} />
        </div>
      </div>
    </div>
  );
}
