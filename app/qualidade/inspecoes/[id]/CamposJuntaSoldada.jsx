"use client";
import { TIPOS_JUNTA, camposDaSelecao, descricaoEps, partesEps, rotuloEps } from "@/lib/eps-casa";

// ⚠ de módulo, não de dentro do componente: definido lá dentro, o React troca a identidade a cada
// render e desmonta o controle (ver lib/react-estavel.js).
const classe = "w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50";
const Rotulo = ({ children }) => <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{children}</span>;
const comGravado = (opcoes, v) => (v && !opcoes.some((o) => o.v === v) ? [{ v, t: `${v} (registrado antes)` }, ...opcoes] : opcoes);

/**
 * A JUNTA SOLDADA no formulário do computador (LP e visual de solda).
 *
 * Vitor (23/09/2026): "nos relatórios da OP-102 está faltando preencher Metal de adição, Processo de
 * soldagem, EPS, RQS e tipo de junta". Eram cinco textos livres; agora as EPS são escolhidas da lista
 * da casa e puxam processo, metal de adição e RQS (lib/eps-casa.js), que continuam editáveis.
 *
 * ⚠ UMA OU MAIS EPS (o EVS-102-001 tem juntas de GMAW e de SMAW): o seletor acrescenta, cada uma
 * vira um chip. ⚠ Devolve os campos soltos (fragmento) para caírem na grade de quem chama.
 * ⚠ Tipo de junta gravado fora da lista aparece como "registrado antes" — um seletor aberto vazio
 * apagaria, na próxima gravação, o que o relatório já dizia.
 */
export default function CamposJuntaSoldada({ res, travado, setResultado, eps = [] }) {
  const escolhidas = partesEps(res.eps);
  const trocar = (rotulos) => { for (const [k, v] of Object.entries(camposDaSelecao(rotulos, eps))) setResultado(k, v); };
  const texto = (rot, k) => (
    <label className="block">
      <Rotulo>{rot}</Rotulo>
      <input aria-label={rot} value={res[k] ?? ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)} className={classe} />
    </label>
  );

  return (
    <>
      <div className="block">
        <Rotulo>EPS</Rotulo>
        {escolhidas.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {escolhidas.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 text-[11px] bg-torg-blue/10 text-torg-blue border border-torg-blue/30 rounded-md px-1.5 py-0.5">
                {r}
                {!travado && <button type="button" aria-label={`Tirar ${r}`} onClick={() => trocar(escolhidas.filter((x) => x !== r))} className="font-bold hover:text-red-600">×</button>}
              </span>
            ))}
          </div>
        )}
        <select aria-label="Acrescentar EPS" value="" disabled={travado} className={classe}
          onChange={(e) => { if (e.target.value) trocar([...escolhidas, e.target.value]); }}>
          <option value="">{escolhidas.length ? "+ outra EPS…" : "Escolha a EPS…"}</option>
          {eps.filter((e) => !escolhidas.includes(rotuloEps(e))).map((e) => <option key={e.codigo} value={rotuloEps(e)}>{descricaoEps(e)}</option>)}
        </select>
      </div>
      {texto("Processo de soldagem", "processoSolda")}
      {texto("Metal de adição", "metalAdicao")}
      {texto("RQS", "rqs")}
      <label className="block">
        <Rotulo>Tipo de junta</Rotulo>
        <select aria-label="Tipo de junta" value={res.tipoJunta || ""} disabled={travado} onChange={(e) => setResultado("tipoJunta", e.target.value)} className={classe}>
          <option value="">—</option>
          {comGravado(TIPOS_JUNTA.map((t) => ({ v: t, t })), res.tipoJunta).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      </label>
    </>
  );
}
