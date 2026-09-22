// GET — marcas de todas as frentes da OP, para EXPORTAR a lista de expedição.
// Só é chamado no clique do "Exportar" (o payload é grande: uma frente pode ter
// milhares de marcas), por isso fica fora do GET do resumo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { acumularRomaneio, totalExpedido, fundirExpedido } from "@/lib/expedido-por-romaneio";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP", "EXPEDICAO"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, obra: true, cliente: true, refCliente: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: op.numero }] },
    orderBy: { frente: "asc" },
    select: { frente: true, arquivo: true, revisao: true, pesoContratado: true, pesoExpedido: true, marcasJson: true },
  });

  // Cruza os romaneios EMITIDOS (RomaneioPrevio.emitidoEm) → quanto já saiu por marca.
  const previosEmitidos = await prisma.romaneioPrevio.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: String(op.numero) }], emitidoEm: { not: null } },
    select: { numero: true, emitidoEm: true, itens: true },
  });
  // ⚠ POR ROMANEIO, não um total solto: é assim que o embarque do portal se funde com o que os
  // FORM 22 da pasta contam sem a mesma carga entrar duas vezes (lib/expedido-por-romaneio.js).
  const expMap = new Map(); // MARCA(upper) -> { porRomaneio:{nº:qtd}, data }
  for (const r of previosEmitidos) {
    for (const it of (Array.isArray(r.itens) ? r.itens : [])) {
      const k = String(it.marca || "").trim().toUpperCase();
      if (!k) continue;
      const cur = expMap.get(k) || { porRomaneio: {}, data: null };
      acumularRomaneio(cur.porRomaneio, { numero: r.numero, qtd: Number(it.qte ?? it.qtd) || 0 });
      if (r.emitidoEm && (!cur.data || r.emitidoEm > cur.data)) cur.data = r.emitidoEm;
      expMap.set(k, cur);
    }
  }

  // Baixas MANUAIS (sem romaneio) por marca — motivo registrado, destaque amarelo.
  const baixas = await prisma.baixaExpedicao.findMany({ where: { opId: op.id } });
  const baixaMap = new Map(); // MARCA(upper) -> { qtd, itens:[{id,motivo,qtd,observacao}] }
  for (const b of baixas) {
    const k = String(b.marca || "").trim().toUpperCase();
    if (!k) continue;
    const cur = baixaMap.get(k) || { qtd: 0, itens: [] };
    cur.qtd += Number(b.qtd) || 0;
    cur.itens.push({ id: b.id, motivo: b.motivo, qtd: b.qtd, observacao: b.observacao });
    baixaMap.set(k, cur);
  }

  const frentes = listas.map((l) => ({
    frente: l.frente,
    arquivo: l.arquivo,
    revisao: l.revisao,
    pesoContratado: l.pesoContratado,
    pesoExpedido: l.pesoExpedido,
    marcas: (Array.isArray(l.marcasJson) ? l.marcasJson : []).map((m) => {
      const qte = m.qte ?? null;
      const kU = String(m.marca || "").trim().toUpperCase();
      const ex = expMap.get(kU);
      const bx = baixaMap.get(kU);
      const baixaQtd = bx ? bx.qtd : 0;
      // ⚠⚠ O QUE SAIU VEM DAS DUAS FONTES, FUNDIDAS POR NÚMERO DE ROMANEIO: os FORM 22 da pasta
      // (`m.expedidoPorRomaneio`, gravado na importação da lista) e os prévios emitidos aqui. O
      // romaneio emitido pelo portal vira arquivo na pasta — somar as duas listas contaria a mesma
      // carga duas vezes.
      // ⚠ Lista importada ANTES de 22/09/2026 não tem o `expedidoPorRomaneio`: ela continua caindo
      // no booleano de sempre, lá embaixo, até a próxima importação da lista.
      const porRomaneio = fundirExpedido(m.expedidoPorRomaneio, ex?.porRomaneio);
      const totalExp = totalExpedido(porRomaneio) + baixaQtd;
      const expedidoQtd = qte != null ? Math.min(totalExp, qte) : totalExp;
      const romaneios = Object.keys(porRomaneio)
        .sort((a2, b2) => Number(a2) - Number(b2))
        .map((n) => String(n).padStart(2, "0"));
      // Situação derivada da quantidade: expedida (tudo saiu) / parcial / pendente.
      const totalmenteExpedida = qte != null && qte > 0 && expedidoQtd >= qte;
      return {
        marca: m.marca,
        descricao: m.descricao || "",
        qte,
        pesoUnit: m.pesoUnit ?? null,
        pesoTotal: m.pesoTotal ?? 0,
        expedidoQtd,                          // nº de peças expedidas (romaneios + baixas manuais)
        baixaQtd,                             // quanto veio de baixa MANUAL (sem romaneio)
        baixas: bx ? bx.itens : [],           // motivos + ids (destaque amarelo + desfazer)
        romaneios,                            // nº dos romaneios em que saiu
        // expedido (booleano) mantido p/ compat: true só quando saiu TUDO. Sem romaneio,
        // cai na coluna "Marca (Expedido)" do próprio arquivo.
        expedido: expedidoQtd > 0 ? totalmenteExpedida : (m.expedidoRomaneio ?? (m.expedidoArquivo === true ? true : m.expedidoArquivo === false ? false : null)),
        origemExpedido: ex ? "romaneio" : (m.expedidoRomaneio != null ? "romaneio" : m.expedidoArquivo != null ? "arquivo" : null),
        romaneio: romaneios.length ? romaneios.join(", ") : (m.romaneio ?? null),
        dataExpedicao: ex?.data ?? m.dataExpedicao ?? null,
      };
    }),
  }));

  return NextResponse.json({ success: true, op: { numero: op.numero, obra: op.obra, cliente: op.cliente, refCliente: op.refCliente }, frentes });
}
