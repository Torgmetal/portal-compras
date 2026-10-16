// ─── OS DADOS DO PACKING LIST DA VALMET, NA PASTA DA OBRA ────────────────────────────────────────
//
// Acha a pasta da OP e lê (só leitura — lib/packing-valmet-fontes.js interpreta):
//   1. Comercial/1.3 Pedido de compras  → a OC da Valmet (maior revisão: "rev1" vence a original) e a Instrução de
//                                          Faturamento;
//   2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.5 Listas de Controle Interno → a Lista de Equivalência Torg ×
//                                          Valmet de MAIOR revisão.
// ⚠⚠ A LISTA DE EQUIVALÊNCIA VAI SOFRER REVISÃO (Vitor, 16/10/2026) — e a R01 já trocou o Valmet Code de 101 peças da
// OP-094 (MF01219225 → MF01219515). Por isso nada disto fica gravado no portal: cada emissão lê a revisão do dia.
// Pasta OBSOLETOS nunca entra (só se olham ARQUIVOS da pasta, não subpastas). Falhar aqui não segura o romaneio:
// devolve o que conseguiu e um aviso.
import "server-only";
import { prisma } from "./prisma";
import { listChildrenByPath, downloadFileByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";
import { pastaDaOP } from "./databook-pastas";
import { lerOcValmet, lerInstrucaoValmet, lerEquivalenciaValmet, maisRecente, revisaoValmet } from "./packing-valmet-fontes";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// o texto de cada página com as quebras de linha (com mergePages o unpdf cola tudo numa linha só e os campos se perdem)
async function textoDoPdf(buffer) {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join("\n");
}

export async function dadosValmet({ op, previoId, seguirSimulacao = true, textoPdf = textoDoPdf }) {
  const avisos = [];
  const vazio = { oc: null, instrucao: null, equivalencia: new Map(), revisaoEquivalencia: null };
  const sim = seguirSimulacao && previoId
    ? await prisma.cargaSimulada.findFirst({ where: { romaneioPrevioId: previoId }, orderBy: { createdAt: "desc" }, select: { cargas: true } }).catch(() => null)
    : null;
  // as cargas da simulação em sequência: volume 1, 2, 3… através dos caminhões (a mesma leitura do FOR-081)
  const volumes = sim ? (Array.isArray(sim.cargas) ? sim.cargas : []).flatMap((c) => (Array.isArray(c.romaneio) ? c.romaneio : [])).map((v, i) => ({ ...v, volume: i + 1 })) : null;

  try {
    const driveId = await resolveServidorDriveId();
    const raiz = await pastaDaOP(driveId, op.numero);
    if (!raiz) return { ...vazio, volumes, avisos: ["Pasta da OP não encontrada no servidor — Packing List sem os dados da Valmet."] };
    const filhos = (p) => listChildrenByPath(driveId, p);
    const sub = async (p, rx) => { const f = (await filhos(p)).find((c) => c.folder && rx.test(semAcento(c.name))); return f ? `${p}/${f.name}` : null; };
    const baixar = (p) => downloadFileByPath({ driveId, fullPath: p });

    const r = { ...vazio };
    const pedidos = await sub(raiz, /comercial/i).then((p) => p && sub(p, /pedido de compra/i));
    if (pedidos) {
      const arqs = (await filhos(pedidos)).filter((c) => c.file);
      const oc = maisRecente(arqs.filter((a) => /\.pdf$/i.test(a.name)), /^\s*OC\b/i);
      const inst = arqs.find((a) => /\.pdf$/i.test(a.name) && /instru/i.test(semAcento(a.name)));
      if (oc) r.oc = lerOcValmet(await textoPdf(await baixar(`${pedidos}/${oc.name}`))); else avisos.push("OC da Valmet não encontrada em 1.3 Pedido de compras — sem Nr. do Projeto e Order Txt.");
      if (inst) r.instrucao = lerInstrucaoValmet(await textoPdf(await baixar(`${pedidos}/${inst.name}`))); else avisos.push("Instrução de Faturamento não encontrada em 1.3 Pedido de compras — sem os dados do comprador.");
    } else avisos.push("A obra não tem a pasta 1.3 Pedido de compras — sem a OC e a Instrução de Faturamento.");

    const controle = await sub(raiz, /engenharia/i)
      .then((p) => p && sub(p, /^2\.5\b|projetos$/i))
      .then((p) => p && sub(p, /^2\.5\.2\b|fabrica/i))
      .then((p) => p && sub(p, /^2\.5\.2\.5\b|controle interno/i));
    const eq = controle && maisRecente((await filhos(controle)).filter((c) => c.file && /\.xlsx?$/i.test(c.name)), /equival/i);
    if (eq) {
      r.equivalencia = await lerEquivalenciaValmet(await baixar(`${controle}/${eq.name}`));
      r.revisaoEquivalencia = revisaoValmet(eq.name);
    } else avisos.push("Lista de Equivalência Torg × Valmet não encontrada em 2.5.2.5 Listas de Controle Interno — o Valmet Code sai em branco.");
    return { ...r, volumes, avisos };
  } catch (e) {
    return { ...vazio, volumes, avisos: [...avisos, `Não consegui ler a pasta da obra no servidor: ${String(e?.message || e).slice(0, 160)}`] };
  }
}
