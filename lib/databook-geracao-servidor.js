// ─── A GERAÇÃO DO DATA BOOK CONTINUA NO SERVIDOR ─────────────────────────────────────────────────
//
// ⚠⚠ Vitor (15/10/2026), OP-094: "não estamos conseguindo gerar o pdf". Não era erro: a tela tocava a geração volume a
// volume e, quando a pessoa trocou de página no meio (16h02, logo depois do volume 2), parou — e o cron só recolhe
// geração abandonada na hora cheia + 15. Pedido dele: avisar na tela E o servidor continuar sozinho.
//
// O servidor monta volumes em sequência até perto do limite de tempo da função (`maxDuration` 300 s; cada volume leva
// ~1 min, então só COMEÇA um volume até 180 s) e, se ainda faltar, chama a si mesmo para continuar. A vez continua
// sendo a mesma trava de `processarGeracao` (lib/databook-volumes.js): tela, cron e servidor nunca montam o mesmo
// volume juntos — quem chega sem a vez sai ("ocupado").

export const ORCAMENTO_MS = 180_000;

/**
 * @param {{ jobId:string, processar:(id:string)=>Promise<object>, relancar:()=>Promise<void>, agora?:()=>number, orcamentoMs?:number }} x
 */
export async function tocarNoServidor({ jobId, processar, relancar, agora = () => Date.now(), orcamentoMs = ORCAMENTO_MS }) {
  const t0 = agora();
  let r = {};
  while (agora() - t0 < orcamentoMs) {
    r = (await processar(jobId)) || {};
    if (r.concluido || r.ocupado) return { ...r, relancado: false };
  }
  await relancar();
  return { ...r, concluido: false, relancado: true };
}
