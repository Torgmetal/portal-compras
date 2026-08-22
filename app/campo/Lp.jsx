"use client";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { LAUDOS } from "@/lib/evs-campos";
import {
  TIPOS_PENETRANTE, METODOS, MARCAS, REMOVEDORES, CONDICOES_SUPERFICIE, TIPOS_INDICACAO,
  conferirEnsaio, tipoSugerido,
  PENETRACAO_MIN, PENETRACAO_MAX, SECAGEM_MIN, REVELADOR_MAX,
  LUX_MINIMO_COLORIDA, LUX_MAXIMO_FLUORESCENTE, UV_MINIMO,
} from "@/lib/lp-campos";

// ─── LÍQUIDO PENETRANTE NO CELULAR ────────────────────────────────────────────
// O ensaio acontece na frente da peça e é CRONOMETRADO: penetração de 10 a 60 min,
// secagem de no mínimo 5, revelador em até 30 (PO-15, itens 8, 10 e 11). Furar
// qualquer um invalida o ensaio SEM deixar marca no resultado — o líquido não teve
// tempo de entrar, ou entrou e secou. Num formulário de mesa isso se descobre tarde;
// aqui a faixa fica embaixo do campo e o aviso aparece na hora.

/** Os parâmetros do ensaio — uma vez, valem para todas as juntas da folha. */
export function ParametrosLP({ cond, setCond }) {
  const set = (k, v) => setCond((c) => ({ ...c, [k]: v }));
  const fluor = cond.tipoPenetrante === "I";
  const check = conferirEnsaio({
    tipo: cond.tipoPenetrante, lux: cond.iluminacao, uv: cond.uv, tempSuperficie: cond.temperatura,
    penetracao: cond.tempoPenetracao, secagem: cond.tempoSecagem, revelador: cond.tempoRevelador,
  });

  return (
    <div className="mt-3 space-y-2.5">
      <p className="text-[12px] font-semibold text-torg-gray">Parâmetros do ensaio</p>
      <p className="text-[11px] text-torg-gray -mt-1.5">Uma vez por ensaio — valem para todas as juntas desta folha.</p>

      <Sel rot="Tipo de penetrante" v={cond.tipoPenetrante} onMudar={(v) => set("tipoPenetrante", v)}
        opcoes={TIPOS_PENETRANTE.map((t) => ({ v: t.id, t: t.nome }))} destaque={!cond.tipoPenetrante} />
      <Sel rot="Método (remoção)" v={cond.metodo} onMudar={(v) => set("metodo", v)}
        opcoes={METODOS.map((m) => ({ v: m.id, t: m.nome }))} />

      <div className="grid grid-cols-2 gap-2">
        <Sel rot="Penetrante" v={cond.penetranteMarca} onMudar={(v) => set("penetranteMarca", v)}
          opcoes={MARCAS.map((m) => ({ v: m, t: m }))} />
        <Txt rot="Lote" v={cond.penetranteLote} onMudar={(v) => set("penetranteLote", v)} />
        <Sel rot="Removedor" v={cond.removedor} onMudar={(v) => set("removedor", v)}
          opcoes={REMOVEDORES.map((m) => ({ v: m, t: m }))} />
        <Txt rot="Lote" v={cond.removedorLote} onMudar={(v) => set("removedorLote", v)} />
        <Sel rot="Revelador" v={cond.revelador} onMudar={(v) => set("revelador", v)}
          opcoes={MARCAS.map((m) => ({ v: m, t: m }))} />
        <Txt rot="Lote" v={cond.reveladorLote} onMudar={(v) => set("reveladorLote", v)} />
      </div>

      <Txt rot={`Penetração (min) · ${PENETRACAO_MIN} a ${PENETRACAO_MAX}`} tipo="number"
        v={cond.tempoPenetracao} onMudar={(v) => set("tempoPenetracao", v)} />
      <div className="grid grid-cols-2 gap-2">
        <Txt rot={`Secagem (min) · mín. ${SECAGEM_MIN}`} tipo="number" v={cond.tempoSecagem} onMudar={(v) => set("tempoSecagem", v)} />
        <Txt rot={`Interpretação (min) · máx. ${REVELADOR_MAX}`} tipo="number" v={cond.tempoRevelador} onMudar={(v) => set("tempoRevelador", v)} />
        <Txt rot={`Temp. superfície (°C) · ${fluor ? "10 a 38" : "10 a 52"}`} tipo="number" v={cond.temperatura} onMudar={(v) => set("temperatura", v)} />
        {/* ⚠ a exigência de luz INVERTE com a técnica: a colorida quer luz, a fluorescente
            quer escuro. Trocar as duas invalida o ensaio, por isso o rótulo muda junto. */}
        <Txt rot={`Iluminação (lux) · ${fluor ? `máx. ${LUX_MAXIMO_FLUORESCENTE}` : `mín. ${LUX_MINIMO_COLORIDA}`}`}
          tipo="number" v={cond.iluminacao} onMudar={(v) => set("iluminacao", v)} />
      </div>
      {fluor && <Txt rot={`Luz negra (µW/cm²) · mín. ${UV_MINIMO}`} tipo="number" v={cond.uv} onMudar={(v) => set("uv", v)} />}

      <Sel rot="Condições superficiais" v={cond.condicoes} onMudar={(v) => set("condicoes", v)}
        opcoes={CONDICOES_SUPERFICIE.map((c) => ({ v: c, t: c }))} />

      {check.avaliado && (
        <div className={`rounded-xl px-3 py-2.5 ${check.conforme ? "bg-emerald-50 border-2 border-emerald-300" : "bg-red-50 border-2 border-red-300"}`}>
          <p className={`text-[13px] font-bold inline-flex items-center gap-1.5 ${check.conforme ? "text-emerald-800" : "text-red-700"}`}>
            {check.conforme ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {check.conforme ? "Ensaio dentro do procedimento" : "ENSAIO FORA DO PROCEDIMENTO"}
          </p>
          {!check.conforme && (
            <ul className="text-[12px] text-red-700 mt-1 space-y-0.5">
              {check.problemas.map((p, i) => <li key={i}>· {p}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** A indicação encontrada numa junta. */
export function IndicacaoLP({ l, set }) {
  const sug = tipoSugerido(l.tamanho);
  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Txt rot="Nº da indicação" v={l.indicacaoLp} onMudar={(v) => set("indicacaoLp", v)} />
        <Txt rot="Local" v={l.local} onMudar={(v) => set("local", v)} />
        <Txt rot="Tamanho (mm)" v={l.tamanho} onMudar={(v) => set("tamanho", v)} />
        <Sel rot="Tipo" v={l.tipoDefeito} onMudar={(v) => set("tipoDefeito", v)}
          opcoes={TIPOS_INDICACAO.map((t) => ({ v: t.id, t: t.id }))} />
      </div>
      {/* ⚠ o portal SUGERE, não decide: abaixo de 1,5 mm o item 14.1.1 diz que a indicação
          não é relevante, mas quem julga é quem viu a peça. */}
      {sug && l.tipoDefeito !== sug && (
        <p className="text-[12px] text-amber-700">PO-15: abaixo de 1,5 mm a indicação não é relevante — marcar {sug}?</p>
      )}
      {/* ⚠ O LAUDO É O PONTO PRINCIPAL e quase ficou de fora: os botões viviam no ramo do
          visual de solda, que o LP não usa mais. Sem eles a peça não tem veredito — e é o
          veredito que faz o documento existir. */}
      <div className="grid grid-cols-3 gap-1.5">
        {LAUDOS.map((v) => {
          const on = l.laudo === v.c;
          const cor = v.c === "A" ? "bg-emerald-600 border-emerald-600" : v.c === "R" ? "bg-red-600 border-red-600" : "bg-amber-500 border-amber-500";
          return (
            <button key={v.c} onClick={() => set("laudo", v.c)}
              className={`rounded-lg py-2 border leading-tight ${on ? `${cor} text-white` : "text-torg-dark border-gray-200 active:bg-gray-50"}`}>
              <span className="block text-[15px] font-bold">{v.c}</span>
              <span className={`block text-[10px] ${on ? "text-white/85" : "text-torg-gray"}`}>{v.curto}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-torg-gray">
        IL linear · IA arredondada · INR não relevante. Junta sem indicação: deixe em branco e marque o laudo A.
      </p>
    </div>
  );
}

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

function Sel({ rot, v, opcoes, onMudar, destaque = false }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
      <select value={v ?? ""} onChange={(e) => onMudar(e.target.value)}
        className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none ${destaque ? "border-amber-400 bg-amber-50" : "border-gray-200 focus:border-torg-blue"}`}>
        <option value="">—</option>
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );
}
