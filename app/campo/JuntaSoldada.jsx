"use client";
import { Txt, Sel } from "./controles";
import { TIPOS_JUNTA, camposDaSelecao, descricaoEps, partesEps, rotuloEps } from "@/lib/eps-casa";

// ─── A JUNTA SOLDADA, NO CELULAR (LP e visual de solda) ───────────────────────────────────────
//
// Vitor (23/09/2026): "nos relatórios da OP-102 está faltando preencher Metal de adição, Processo
// de soldagem, EPS, RQS e tipo de junta". O modelo revisado de 21/09 imprime os cinco, mas eles só
// existiam no formulário do computador — quem inspeciona, no celular, não tinha onde pôr.
//
// ⚠ A EPS PUXA OS OUTROS. Processo, metal de adição e RQS são propriedades da EPS (lib/eps-casa.js):
// escolher preenche os três, que continuam editáveis. O tipo de junta é da peça ensaiada.
// ⚠⚠ UMA OU MAIS EPS, como os lotes da tinta: o seletor ACRESCENTA e cada EPS vira um chip. O
// EVS-102-001 tem juntas de GMAW e de SMAW — com uma EPS só, o cabeçalho mentiria sobre metade.
// ⚠ Valor gravado que não está na lista continua à vista — senão sumiria na próxima gravação.

const comGravado = (opcoes, v) => (v && !opcoes.some((o) => o.v === v) ? [{ v, t: `${v} (registrado antes)` }, ...opcoes] : opcoes);

export default function JuntaSoldada({ cond, setCond, eps = [] }) {
  const set = (k, v) => setCond((c) => ({ ...c, [k]: v }));
  const escolhidas = partesEps(cond.eps);
  const trocar = (rotulos) => setCond((c) => ({ ...c, ...camposDaSelecao(rotulos, eps) }));
  const restantes = eps.filter((e) => !escolhidas.includes(rotuloEps(e)));

  return (
    <fieldset className="mt-3 rounded-xl border-2 border-gray-100 p-3 space-y-2.5">
      <legend className="px-1 text-[13px] font-semibold text-torg-dark">Junta soldada</legend>
      <p className="text-[11px] text-torg-gray -mt-1">Escolha a EPS: processo, metal de adição e RQS vêm dela. Mais de um processo? Acrescente as duas.</p>
      <div>
        <span className="block text-[12px] text-torg-gray mb-1">EPS</span>
        {escolhidas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {escolhidas.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 text-[13px] bg-torg-blue/10 text-torg-blue border border-torg-blue/30 rounded-xl px-2.5 py-1.5">
                {r}
                <button type="button" aria-label={`Tirar ${r}`} onClick={() => trocar(escolhidas.filter((x) => x !== r))}
                  className="font-bold px-0.5 active:text-red-600">×</button>
              </span>
            ))}
          </div>
        )}
        <select aria-label="Acrescentar EPS" value="" onChange={(e) => { if (e.target.value) trocar([...escolhidas, e.target.value]); }}
          className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
          <option value="">{escolhidas.length ? "+ outra EPS…" : "Escolha a EPS…"}</option>
          {restantes.map((e) => <option key={e.codigo} value={rotuloEps(e)}>{descricaoEps(e)}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Txt rot="Processo de soldagem" v={cond.processoSolda} onMudar={(v) => set("processoSolda", v)} />
        <Txt rot="Metal de adição" v={cond.metalAdicao} onMudar={(v) => set("metalAdicao", v)} />
        <Txt rot="RQS" v={cond.rqs} onMudar={(v) => set("rqs", v)} />
        <Sel rot="Tipo de junta" v={cond.tipoJunta} opcoes={comGravado(TIPOS_JUNTA.map((t) => ({ v: t, t })), cond.tipoJunta)}
          onMudar={(v) => set("tipoJunta", v)} />
      </div>
    </fieldset>
  );
}
