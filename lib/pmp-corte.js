// Alimenta o PMP (PmpMeta, setor CORTE) a partir da programação da fila de
// corte: cada peça com data meta início/fim tem sua qte/peso distribuída
// pelos dias úteis (seg–sex, a grade do PMP) do período. O recálculo é
// derivado e idempotente — sempre reconstrói as metas automáticas das OPs
// afetadas a partir do estado atual das peças.
//
// Metas automáticas são marcadas com observacao OBS_AUTO; metas digitadas à
// mão no PMP para (dia, CORTE, OP) que a programação também cobre são
// sobrescritas (a programação é a fonte da verdade do corte).
import { prisma } from "@/lib/prisma";

export const OBS_AUTO = "[auto] Programação de corte";

const dia0 = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const iso = (d) => d.toISOString().split("T")[0];

// Dias úteis (seg–sex) entre inicio e fim, inclusive. Se o período cair só
// em fim de semana, usa a segunda-feira seguinte (o PMP não exibe sáb/dom).
export function diasUteis(inicio, fim) {
  const dias = [];
  for (let d = dia0(inicio); d <= dia0(fim); d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) dias.push(new Date(d));
  }
  if (dias.length === 0) {
    const seg = dia0(fim);
    seg.setUTCDate(seg.getUTCDate() + ((8 - seg.getUTCDay()) % 7 || 7));
    dias.push(seg);
  }
  return dias;
}

/**
 * Recalcula as metas automáticas de CORTE no PMP para as OPs informadas.
 * Não-fatal por design: o chamador decide se trata o erro como aviso.
 * @param {string[]} opNumeros
 * @param {string} userId — criador das metas novas
 * @returns {{ metasGravadas: number, avisos: string[] }}
 */
export async function recalcularPmpCorte(opNumeros, userId) {
  const avisos = [];
  const unicos = [...new Set(opNumeros)].filter(Boolean);
  if (unicos.length === 0) return { metasGravadas: 0, avisos };

  // PmpMeta tem FK obrigatória em OP.numero — só OPs cadastradas entram
  const opsValidas = new Set(
    (await prisma.oP.findMany({ where: { numero: { in: unicos } }, select: { numero: true } })).map((o) => o.numero)
  );
  for (const op of unicos) {
    if (!opsValidas.has(op)) avisos.push(`OP ${op} não está cadastrada no portal — metas dessa OP não entram no PMP.`);
  }
  const alvo = unicos.filter((op) => opsValidas.has(op));
  if (alvo.length === 0) return { metasGravadas: 0, avisos };

  // Estado atual: todas as peças programadas dessas OPs (concluídas inclusive
  // — o plano registrado não some quando a peça é cortada)
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opNumero: { in: alvo }, corteDataMetaInicio: { not: null }, corteDataMetaFim: { not: null } },
    select: { opNumero: true, qte: true, pesoTotalKg: true, corteDataMetaInicio: true, corteDataMetaFim: true },
  });

  // Peças com a MESMA janela meta formam um lote de programação — é o lote
  // que se distribui pelos dias (80 peças seg→sex ≈ 16/dia), não cada peça
  // isolada (senão toda qte cairia no primeiro dia útil).
  const lotes = new Map(); // "op|inicio|fim" → { opNumero, inicio, fim, qte, pesoKg }
  for (const p of pecas) {
    const key = `${p.opNumero}|${iso(dia0(p.corteDataMetaInicio))}|${iso(dia0(p.corteDataMetaFim))}`;
    const acc = lotes.get(key) || { opNumero: p.opNumero, inicio: p.corteDataMetaInicio, fim: p.corteDataMetaFim, qte: 0, pesoKg: 0 };
    acc.qte += Math.max(1, Number(p.qte) || 1);
    acc.pesoKg += Number(p.pesoTotalKg) || 0;
    lotes.set(key, acc);
  }

  // Distribuição do lote: qte inteira espalhada pelos dias (resto nos
  // primeiros), peso proporcional por dia
  const porDiaOp = new Map(); // "iso|op" → { pecas, pesoKg }
  for (const lote of lotes.values()) {
    const dias = diasUteis(lote.inicio, lote.fim);
    const base = Math.floor(lote.qte / dias.length);
    const resto = lote.qte % dias.length;
    const pesoDia = lote.pesoKg / dias.length;
    dias.forEach((d, i) => {
      const key = `${iso(d)}|${lote.opNumero}`;
      const acc = porDiaOp.get(key) || { pecas: 0, pesoKg: 0 };
      acc.pecas += base + (i < resto ? 1 : 0);
      acc.pesoKg += pesoDia;
      porDiaOp.set(key, acc);
    });
  }

  // Reconstrói: remove metas automáticas antigas dessas OPs e regrava
  await prisma.pmpMeta.deleteMany({
    where: { setor: "CORTE", opNumero: { in: alvo }, observacao: OBS_AUTO },
  });
  let metasGravadas = 0;
  for (const [key, val] of porDiaOp) {
    const [dataIso, opNumero] = key.split("|");
    await prisma.pmpMeta.upsert({
      where: { data_setor_opNumero: { data: new Date(dataIso + "T00:00:00Z"), setor: "CORTE", opNumero } },
      create: {
        data: new Date(dataIso + "T00:00:00Z"),
        setor: "CORTE",
        opNumero,
        metaPecas: val.pecas,
        metaPesoKg: Math.round(val.pesoKg * 10) / 10,
        observacao: OBS_AUTO,
        criadoPorId: userId,
      },
      update: {
        metaPecas: val.pecas,
        metaPesoKg: Math.round(val.pesoKg * 10) / 10,
        observacao: OBS_AUTO,
      },
    });
    metasGravadas++;
  }
  return { metasGravadas, avisos };
}
