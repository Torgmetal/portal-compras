import "server-only";
import * as XLSX from "xlsx";
import { getAccessToken } from "./sharepoint";
import { resolveServidorDriveId, listarPastasOp } from "./sharepoint-lpc";

// ─── A LE QUE JÁ ESTÁ NO SERVIDOR ─────────────────────────────────────────────
// Vitor (29/08/2026): a Engenharia salva a Lista de Expedição na pasta da obra e o portal não a
// enxerga — quem quisesse carregar tinha de reenviar o arquivo pela tela. Medido em 29/08: SEIS
// obras (105, 106, 108, 109, 111, 114) com o arquivo lá desde 12 a 27/08 e ZERO peças no portal.
// Todos os seis abriram no parser sem erro. Não é formato, não é pasta, não é permissão — é o
// passo manual que ninguém lembra de dar.
//
// ⚠ O CAMINHO É O MESMO que o portal usa para GRAVAR (lib/sharepoint-lista, SUBPASTA.LE). Se um dia
// mudar lá, muda aqui — por isso a constante repete o valor com esta nota, e não é adivinhação.
const SUBPASTA_LE = "2. Engenharia/2.6 Lista de Expedição";
const GRAPH = "https://graph.microsoft.com/v1.0";

/** Acha a pasta da OP no servidor pelo número (os nomes são "OP-105 - TMSA - ..."). */
export async function pastaDaOp(opNumero) {
  const dig = String(opNumero || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!dig) return null;
  const { ops, base } = await listarPastasOp();
  const rx = new RegExp(`^OP-0*${dig}\\b`, "i");
  const achada = ops.find((o) => rx.test(o.pasta));
  return achada ? { pasta: achada.pasta, base } : null;
}

/**
 * Os arquivos de LE dessa OP no servidor, do mais recente para o mais antigo.
 * ⚠ Só .xls/.xlsx: a pasta também guarda PDF e a subpasta "Obsoleto", que não se importa.
 */
export async function lesDaOp(opNumero) {
  const driveId = await resolveServidorDriveId();
  if (!driveId) throw new Error("Drive SERVIDOR não resolvido.");
  const p = await pastaDaOp(opNumero);
  if (!p) return { arquivos: [], pasta: null };

  const caminho = `${p.base}/${p.pasta}/${SUBPASTA_LE}`;
  const token = await getAccessToken();
  const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children?$top=100&$select=id,name,size,lastModifiedDateTime,folder`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { arquivos: [], pasta: caminho, erro: `A pasta "${SUBPASTA_LE}" não foi encontrada nesta OP.` };

  const arquivos = ((await res.json()).value || [])
    .filter((x) => !x.folder && /\.xlsx?$/i.test(x.name || ""))
    .map((x) => ({ id: x.id, nome: x.name, tamanho: x.size || 0, modificadoEm: x.lastModifiedDateTime }))
    .sort((a, b) => String(b.modificadoEm).localeCompare(String(a.modificadoEm)));
  return { arquivos, pasta: caminho };
}

/**
 * Baixa o arquivo e devolve as LINHAS da planilha — o mesmo formato que a tela envia hoje para
 * /api/producao/pecas/importar-le, para o import continuar tendo UM caminho só.
 *
 * ⚠ REUSAR A ROTA DE IMPORT, e não copiar a lógica dela: ela resolve a OP, faz o upsert por marca,
 * amarra a peça órfã e grava o AuditLog. Uma segunda implementação divergiria na primeira correção.
 */
export async function linhasDaLe(itemId) {
  const driveId = await resolveServidorDriveId();
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "follow",
  });
  if (!res.ok) throw new Error(`Falha ao baixar o arquivo (HTTP ${res.status}).`);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}
