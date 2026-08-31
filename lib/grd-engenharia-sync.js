import "server-only";
import { prisma } from "./prisma";
import { getAccessToken } from "./sharepoint";
import { lerGrd, dadosDoNome } from "./grd-engenharia";

// ─── VARRE A PASTA E IMPORTA O QUE MUDOU ──────────────────────────────────────────────────────
// Vitor (31/08/2026): "quero que vc puxe nessa pasta sempre que for colocado uma nova grd".
//
// ⚠ SÓ LÊ O QUE MUDOU. São 485 planilhas na pasta e cada leitura é um download: reprocessar tudo a
// cada rodada gastaria minutos e cota do Graph para reconfirmar o que já está no banco. A comparação
// é pelo `lastModifiedDateTime` do arquivo — se ele não mexeu, o conteúdo é o mesmo.
//
// ⚠⚠ REVISÃO É ARQUIVO NOVO, NÃO ATUALIZAÇÃO. `GRD-123_R01.xlsx` vive ao lado do `_R00`, e as duas
// entram como registros distintos. Sobrescrever a R00 apagaria exatamente o histórico de revisão que
// o procedimento da Engenharia pede.

export const PASTA_GRD = "/Engenharia/13. GRD";
const GRAPH = "https://graph.microsoft.com/v1.0";
const RX_GRD = /GRD-\d+_R\d+\.xlsx$/i;

async function listarPasta(token, driveId) {
  let url = `${GRAPH}/drives/${driveId}/root:${encodeURI(PASTA_GRD)}:/children?$top=999&$select=id,name,folder,lastModifiedDateTime`;
  const itens = [];
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`SharePoint ${r.status} ao listar ${PASTA_GRD}`);
    const j = await r.json();
    itens.push(...(j.value || []));
    url = j["@odata.nextLink"] || null;
  }
  return itens.filter((x) => !x.folder && RX_GRD.test(x.name));
}

/**
 * Importa as GRDs novas ou alteradas.
 * @param {{limite?: number}} opts
 * @returns {Promise<{lidas:number, novas:object[], revisoes:object[], erros:object[], total:number}>}
 */
export async function sincronizarGrds({ limite = 60 } = {}) {
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!driveId) throw new Error("SHAREPOINT_DRIVE_ID não configurado.");
  const token = await getAccessToken();

  const arquivos = await listarPasta(token, driveId);
  const jaTem = await prisma.grdEngenharia.findMany({ select: { itemId: true, modificadoEm: true } });
  const mapa = new Map(jaTem.map((g) => [g.itemId, g.modificadoEm?.toISOString() || null]));

  const pendentes = arquivos.filter((a) => mapa.get(a.id) !== a.lastModifiedDateTime).slice(0, limite);

  const XLSX = await import("xlsx");
  const novas = [], revisoes = [], erros = [];

  for (const a of pendentes) {
    try {
      const r = await fetch(`${GRAPH}/drives/${driveId}/items/${a.id}/content`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`download ${r.status}`);
      const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: "buffer" });
      const grade = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false });
      const g = lerGrd(grade, a.name);
      const doNome = dadosDoNome(a.name) || {};
      const numero = g.numero || doNome.numero;
      if (!numero) throw new Error("sem número de GRD");

      // ⚠ a OP resolvida vira `opId` quando existe — é o que liga a GRD à obra no resto do portal.
      const op = g.opNumero
        ? await prisma.oP.findFirst({ where: { numero: g.opNumero }, select: { id: true } })
        : null;

      const dados = {
        numero: String(numero), revisao: g.revisao ?? doNome.revisao ?? 0,
        arquivo: a.name, itemId: a.id,
        data: g.data, de: g.de, para: g.para, referencia: g.referencia,
        opCodigo: g.opCodigo, opNumero: g.opNumero, opId: op?.id || null,
        pesoKg: g.pesoKg, area: g.area, emitidoPor: g.emitidoPor,
        itens: g.itens, qtdDocs: g.itens.length,
        modificadoEm: a.lastModifiedDateTime ? new Date(a.lastModifiedDateTime) : null,
      };

      const existia = mapa.has(a.id);
      const salva = await prisma.grdEngenharia.upsert({
        where: { itemId: a.id }, create: dados, update: dados,
        select: { id: true, numero: true, revisao: true, opNumero: true, qtdDocs: true, referencia: true, avisadoEm: true },
      });
      // ⚠ "revisão" aqui é o que interessa avisar: R01+ é reemissão do MESMO documento, e um arquivo
      // que já existia e mudou de conteúdo é alteração silenciosa — as duas merecem alerta próprio.
      if (salva.revisao > 0 || existia) revisoes.push(salva);
      else novas.push(salva);
    } catch (e) {
      erros.push({ arquivo: a.name, erro: e.message });
    }
  }

  return { lidas: pendentes.length, novas, revisoes, erros, total: arquivos.length };
}
