// ─── AS ETCs DE UMA OBRA DA TMSA, NO SHAREPOINT ─────────────────────────────────────────────────
//
// Acha a pasta da OP, entra em `2. Engenharia/2.1 Projetos Orçados`, e em cada subpasta `OC<nº>_…` lê a ETC de maior
// revisão (lib/etc-tmsa.js). Também devolve o TPR (da ETC ou do nome da pasta: "OP-105 - TMSA - TPR 846 - Bianchini").
// Só leitura. Falhar aqui não pode segurar o romaneio: devolve o que conseguiu e um aviso.
import "server-only";
import { listChildrenByPath, downloadFileByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";
import { pastaDaOP } from "./databook-pastas";
import { lerEtcTmsa, ocDaPasta, revisaoDoArquivo } from "./etc-tmsa";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const RX_ETC = /^ETC[-_ ].*\.xls[xm]?$/i;

export async function etcsDaObra(opNumero) {
  const avisos = [];
  try {
    const driveId = await resolveServidorDriveId();
    const pastaOp = await pastaDaOP(driveId, opNumero);
    if (!pastaOp) return { etcs: [], tpr: null, avisos: ["Pasta da OP não encontrada no servidor — sem as ETCs da TMSA."] };
    const nomePasta = pastaOp.split("/").pop();
    const tprPasta = nomePasta.match(/TPR\s*-?\s*(\d+)/i) ? `TPR${nomePasta.match(/TPR\s*-?\s*(\d+)/i)[1].padStart(5, "0")}` : null;

    const eng = (await listChildrenByPath(driveId, pastaOp)).find((c) => c.folder && /engenharia/i.test(semAcento(c.name)));
    const orc = eng && (await listChildrenByPath(driveId, `${pastaOp}/${eng.name}`)).find((c) => c.folder && /or[cç]ad/i.test(semAcento(c.name)));
    if (!orc) return { etcs: [], tpr: tprPasta, avisos: ["A obra não tem a pasta 2.1 Projetos Orçados — sem as ETCs da TMSA."] };
    const base = `${pastaOp}/${eng.name}/${orc.name}`;

    const etcs = [];
    for (const sub of (await listChildrenByPath(driveId, base)).filter((c) => c.folder && ocDaPasta(c.name))) {
      const arqs = (await listChildrenByPath(driveId, `${base}/${sub.name}`)).filter((c) => c.file && RX_ETC.test(c.name));
      if (!arqs.length) continue;
      // a revisão mais nova da ETC daquela OC (R1 vence R0); a OC é a da PASTA — a original
      const arq = arqs.sort((a, b) => revisaoDoArquivo(b.name) - revisaoDoArquivo(a.name))[0];
      try {
        const lida = lerEtcTmsa(await downloadFileByPath({ driveId, fullPath: `${base}/${sub.name}/${arq.name}` }));
        etcs.push({ oc: ocDaPasta(sub.name), arquivo: arq.name, ...lida });
      } catch (e) {
        avisos.push(`Não consegui ler ${arq.name}: ${String(e?.message || e).slice(0, 120)}`);
      }
    }
    return { etcs, tpr: etcs.find((e) => e.tpr)?.tpr || tprPasta, avisos };
  } catch (e) {
    return { etcs: [], tpr: null, avisos: [`Não consegui ler as ETCs da TMSA no servidor: ${String(e?.message || e).slice(0, 160)}`] };
  }
}
