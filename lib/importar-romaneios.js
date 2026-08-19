import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "./prisma";
import { acharPastaOp, listChildrenByPath, downloadFileById } from "./sharepoint";

// IMPORTAR OS ROMANEIOS ANTIGOS das pastas da OP (SharePoint → portal).
//
// Vitor (19/08/2026): as OPs antigas foram expedidas antes do fluxo de romaneio do portal existir,
// e o papel está em `{OP}/4. Expedição/4.2 Romaneios` (FORM 22 em .xls/.xlsx/.xlsm). Sem isso o
// portal mostra como "em aberto" peça que já está montada na obra do cliente — na OP-060, 43 das
// 44 pendentes já tinham sido embarcadas.
//
// ⚠ SÓ PARA AS OBRAS ANTIGAS. Nas novas o registro nasce do fluxo do portal (RomaneioPrevio →
// romaneio da carga); importar em cima disso duplicaria o embarque. O import recusa OP que já
// tenha romaneio do fluxo novo, a não ser que o chamador force.
//
// Layout do FORM 22 (confirmado nos arquivos reais): cabeçalho com "OP. | T85 | ... | N° | R01.",
// "DATA DE SAÍDA: | 7/20/26" e, mais abaixo, a linha de títulos com a coluna **Marca**, seguida
// dos itens (Marca | Qte. | Unid. | Pos. | Descrição | ... | Peso (Kg)).

const RX_PLANILHA = /\.(xls|xlsx|xlsm)$/i;
const norm = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
// Chave FROUXA pro 2º passe: o romaneio e a LPC escrevem o item comprado diferente —
// "T104-AC1" no papel × "T104AC-001" na lista. Tira hífen/ponto e zera o padding do número
// final, então as duas viram "T104AC1". Só usada quando a marca exata não casou. (Vitor 19/08.)
const chaveFrouxa = (s) => norm(s).replace(/[.\-_/]/g, "").replace(/(\d+)$/, (m) => String(parseInt(m, 10)));
const txt = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// "1.234,56" (pt-BR) × "127.75" (ponto decimal): só trata o ponto como milhar quando HÁ vírgula.
function numero(v) {
  const s = String(v ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

// "7/20/26" (como o Excel exporta) ou dd/mm/aaaa → Date (meio-dia UTC, pra não escorregar de dia).
function data(v) {
  const s = txt(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, a, b, y] = m;
    const ano = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    // a planilha exporta m/d/aa; se o 1º > 12 é dd/mm
    const mes = parseInt(a, 10) > 12 ? parseInt(b, 10) : parseInt(a, 10);
    const dia = parseInt(a, 10) > 12 ? parseInt(a, 10) : parseInt(b, 10);
    const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
    return isNaN(d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** Lê um FORM 22. Devolve null se o arquivo não tiver a tabela (romaneio antigo em outro layout). */
export function lerForm22(buffer) {
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer" }); } catch { return null; }
  const aba = wb.SheetNames.find((n) => /romaneio/i.test(n)) || wb.SheetNames[0];
  if (!aba) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, blankrows: false, defval: "", raw: false });

  // cabeçalho: nº do romaneio e data de saída ficam nas ~30 primeiras linhas, em células soltas
  let numeroRom = null, dataSaida = null, cliente = null, transportador = null;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cels = (rows[r] || []).map(txt);
    for (let c = 0; c < cels.length; c++) {
      const v = cels[c].toUpperCase();
      if (!numeroRom && /^N[º°]\.?$/.test(v) && cels[c + 1]) numeroRom = cels[c + 1].replace(/\.$/, "");
      if (!dataSaida && /DATA DE SA[IÍ]DA/i.test(v)) dataSaida = data(cels[c + 1]);
      if (!cliente && v === "CLIENTE" && cels[c + 1]) cliente = cels[c + 1];
      if (!transportador && v === "TRANSPORTADOR" && cels[c + 1]) transportador = cels[c + 1];
    }
  }

  // tabela de itens: acha a linha de títulos que tem exatamente "Marca"
  let hr = -1, cM = -1, cQ = -1, cU = -1, cD = -1, cP = -1;
  for (let r = 0; r < Math.min(rows.length, 60) && hr < 0; r++) {
    const cels = (rows[r] || []).map((x) => txt(x).toLowerCase());
    const m = cels.findIndex((x) => x === "marca");
    if (m < 0) continue;
    hr = r; cM = m;
    cQ = cels.findIndex((x) => x.startsWith("qte"));
    cU = cels.findIndex((x) => x.startsWith("unid"));
    cD = cels.findIndex((x) => x.startsWith("descri"));
    cP = cels.findIndex((x) => x.startsWith("peso"));
  }
  if (hr < 0) return null;

  const itens = [];
  for (let r = hr + 1; r < rows.length; r++) {
    const linha = rows[r] || [];
    const marca = txt(linha[cM]);
    if (!marca || /^(total|soma|subtotal|\(vazio\))$/i.test(marca)) continue;
    itens.push({
      marca,
      qtd: cQ >= 0 ? numero(linha[cQ]) || 1 : 1,
      unidade: cU >= 0 ? txt(linha[cU]) || null : null,
      descricao: cD >= 0 ? txt(linha[cD]) || null : null,
      pesoKg: cP >= 0 ? numero(linha[cP]) : 0,
    });
  }
  if (!itens.length) return null;
  return { numero: numeroRom, dataSaida, cliente, transportador, itens };
}

/** Arquivos de romaneio da OP no SharePoint (ignora OBSOLETOS). */
export async function listarArquivosRomaneio(opNumero) {
  const base = await acharPastaOp(opNumero);
  if (!base) return { pasta: null, arquivos: [] };
  const pasta = `${base}/4. Expedição/4.2 Romaneios`;
  const kids = await listChildrenByPath(process.env.SHAREPOINT_DRIVE_ID, pasta).catch(() => []);
  const arquivos = (kids || [])
    .filter((x) => x.file && RX_PLANILHA.test(x.name) && !/obsolet/i.test(x.name))
    .map((x) => ({ id: x.id, nome: x.name }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return { pasta, arquivos };
}

/**
 * Lê todos os romaneios da pasta da OP. `gravar: false` → só devolve o que achou (prévia).
 * Marca de peça é casada por marca normalizada (sem espaço, maiúscula).
 */
export async function importarRomaneiosDaOp(opNumero, { gravar = false, user = null, forcar = false } = {}) {
  const num = String(opNumero).replace(/\D/g, "").padStart(3, "0");
  const op = await prisma.oP.findFirst({ where: { numero: num }, select: { id: true, numero: true, obra: true } });
  if (!op) throw new Error("OP não encontrada.");

  // ⚠ trava do fluxo novo: OP que já emite romaneio pelo portal não deve receber import de pasta.
  const doFluxoNovo = await prisma.romaneioPrevio.count({ where: { opId: op.id, emitidoEm: { not: null } } });
  if (doFluxoNovo > 0 && !forcar) {
    throw new Error(`OP-${num} já usa o fluxo de romaneio do portal (${doFluxoNovo} emitido(s)) — importar a pasta duplicaria o embarque.`);
  }

  const { pasta, arquivos } = await listarArquivosRomaneio(num);
  if (!arquivos.length) return { op, pasta, arquivos: 0, lidos: 0, semTabela: [], romaneios: [], marcas: 0, pesoKg: 0, casadas: 0, semCasar: [], gravado: null };

  // peças da OP pra casar a marca (mesmo universo da produção)
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId: op.id },
    select: { id: true, marca: true, status: true, pesoTotalKg: true, pesoUnitKg: true, perfil: true, descricao: true, tipoPeca: true, qte: true, fonte: true },
  });
  // ⚠ AQUI ENTRA TUDO, inclusive item comprado e grade de piso. O `ehItemComprado` existe pra
  // tirar do FLUXO DE FABRICAÇÃO (não fazemos parafuso nem grade) — mas essas peças SÃO
  // ENTREGUES e constam no romaneio. Filtrar aqui deixava degrau e parafuso eternamente em
  // aberto depois de já terem saído. (Vitor 19/08: "a 104 ainda falta peça para entregar".)
  const porMarca = new Map();
  const porFrouxa = new Map();
  // A MESMA peça pode existir 2× (linha da LPC e da LE) com a marca escrita diferente —
  // "T104-AC5" na LE × "T104AC-005" na LPC. Se o romaneio casar com uma, a outra ficaria
  // eternamente pendente. Guarda TODOS os ids da mesma chave frouxa pra marcar os dois.
  const idsPorFrouxa = new Map();
  for (const p of pecas) {
    const k = norm(p.marca);
    // LPC ganha da LE quando a marca existe nas duas (mesma regra do fluxo de produção)
    if (!porMarca.has(k) || p.fonte === "LPC_IMPORT") porMarca.set(k, p);
    const kf = chaveFrouxa(p.marca);
    if (!porFrouxa.has(kf) || p.fonte === "LPC_IMPORT") porFrouxa.set(kf, p);
    idsPorFrouxa.set(kf, [...(idsPorFrouxa.get(kf) || []), p.id]);
  }
  // 1º passe pela marca exata; 2º pela chave frouxa (só o que sobrou).
  const acharPeca = (marca) => porMarca.get(norm(marca)) || porFrouxa.get(chaveFrouxa(marca)) || null;

  const romaneios = [];
  const semTabela = [];
  for (const a of arquivos) {
    let lido = null;
    try {
      const { buffer } = await downloadFileById(process.env.SHAREPOINT_DRIVE_ID, a.id);
      lido = lerForm22(buffer);
    } catch { /* segue: arquivo ilegível vira "sem tabela" */ }
    if (!lido) { semTabela.push(a.nome); continue; }
    // nº do romaneio: o do cabeçalho, senão o prefixo do arquivo ("01. ROMANEIO ..." → 01)
    const numeroRom = lido.numero || (a.nome.match(/^(\d+)/) || [])[1] || a.nome.replace(RX_PLANILHA, "");
    romaneios.push({ ...lido, numero: String(numeroRom), arquivo: a.nome, itemId: a.id });
  }

  // consolida as marcas de todos os romaneios
  const marcasVistas = new Map(); // marcaNorm → { marca, kg, romaneios:[] }
  for (const r of romaneios) {
    for (const it of r.itens) {
      const k = norm(it.marca);
      const g = marcasVistas.get(k) || { marca: it.marca, kg: 0, romaneios: [] };
      g.kg += it.pesoKg;
      if (!g.romaneios.includes(r.numero)) g.romaneios.push(r.numero);
      marcasVistas.set(k, g);
    }
  }
  const casadas = [...marcasVistas.values()].filter((v) => acharPeca(v.marca)).map((v) => v.marca);
  const semCasar = [...marcasVistas.values()].filter((v) => !acharPeca(v.marca)).map((v) => v.marca);
  const pesoKg = [...marcasVistas.values()].reduce((a, v) => a + v.kg, 0);

  if (!gravar) {
    return { op, pasta, arquivos: arquivos.length, lidos: romaneios.length, semTabela,
      romaneios: romaneios.map((r) => ({ numero: r.numero, arquivo: r.arquivo, dataSaida: r.dataSaida, itens: r.itens.length, pesoKg: Math.round(r.itens.reduce((a, i) => a + i.pesoKg, 0)) })),
      marcas: marcasVistas.size, pesoKg: Math.round(pesoKg), casadas: casadas.length, semCasar };
  }

  // ── GRAVA ────────────────────────────────────────────────────────────────────────────────
  let criados = 0, atualizados = 0, itensGravados = 0;
  for (const r of romaneios) {
    const peso = r.itens.reduce((a, i) => a + i.pesoKg, 0);
    const existente = await prisma.romaneio.findFirst({ where: { opId: op.id, numero: r.numero }, select: { id: true } });
    const dados = {
      numero: r.numero, opId: op.id,
      data: r.dataSaida || new Date(),
      pesoRealKg: Math.round(peso * 10) / 10,
      descricao: `Romaneio ${r.numero} — OP-${op.numero}`,
      observacao: `Importado da pasta da OP (${r.arquivo})${r.transportador ? ` · transportador ${r.transportador}` : ""}${user?.name ? ` · por ${user.name}` : ""}`,
      transportadora: r.transportador || null,
      createdById: user?.id || null,
    };
    const rom = existente
      ? await prisma.romaneio.update({ where: { id: existente.id }, data: dados })
      : await prisma.romaneio.create({ data: dados });
    existente ? atualizados++ : criados++;
    // itens: regrava do zero (o arquivo é a verdade)
    await prisma.romaneioItem.deleteMany({ where: { romaneioId: rom.id } });
    await prisma.romaneioItem.createMany({
      data: r.itens.map((it) => ({
        romaneioId: rom.id, tipo: "PECA",
        descricao: [it.marca, it.descricao].filter(Boolean).join(" — ").slice(0, 300),
        pecaConjuntoId: acharPeca(it.marca)?.id || null,
        qtd: it.qtd || 1, pesoKg: it.pesoKg || null,
      })),
    });
    itensGravados += r.itens.length;
  }

  // peças embarcadas saem das filas de produção: status EXPEDIDO (estado terminal do fluxo)
  // Marca a peça casada E suas gêmeas (mesma chave frouxa em outra lista).
  const idsExpedidos = [...new Set(casadas.flatMap((m) => idsPorFrouxa.get(chaveFrouxa(m)) || []))];
  const expedidas = idsExpedidos.length
    ? (await prisma.pecaConjunto.updateMany({ where: { id: { in: idsExpedidos }, status: { not: "EXPEDIDO" } }, data: { status: "EXPEDIDO" } })).count
    : 0;

  return { op, pasta, arquivos: arquivos.length, lidos: romaneios.length, semTabela,
    romaneios: romaneios.map((r) => ({ numero: r.numero, arquivo: r.arquivo, dataSaida: r.dataSaida, itens: r.itens.length })),
    marcas: marcasVistas.size, pesoKg: Math.round(pesoKg), casadas: casadas.length, semCasar,
    gravado: { romaneiosCriados: criados, romaneiosAtualizados: atualizados, itens: itensGravados, pecasExpedidas: expedidas } };
}
