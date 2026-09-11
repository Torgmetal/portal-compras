// CALIBRAGEM DA IMPRESSORA DE ETIQUETAS — quanto o desenho precisa andar para cair no adesivo.
//
// GET  → { deslocX, deslocY }
// PUT  { deslocX, deslocY } → grava
//
// ⚠⚠ É CONSERTO DE MÁQUINA, NÃO DESIGN. O PDF desenha de 1,2 a 98,8 mm numa página de 100: está
// centrado. Se sai cortado, a origem de impressão da Argox está deslocada, e o lugar certo de
// corrigir é o driver. Isto existe porque o driver da Argox nem sempre expõe esse ajuste.
//
// ⚠ GLOBAL, NÃO POR USUÁRIO — é propriedade da IMPRESSORA, e a expedição tem uma. Guardado por
// navegador, cada PC imprimiria diferente e ninguém entenderia por quê.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CHAVE_ARGOX, emMilimetros, lerCalibragem } from "@/lib/etiqueta-calibragem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERFIS = ["ADMIN", "EXPEDICAO", "PRODUCAO", "PCP", "PLANEJAMENTO"];
const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET() {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }
  return NextResponse.json({ success: true, ...(await lerCalibragem(prisma)) });
}

export async function PUT(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 }); }

  const dados = { deslocX: emMilimetros(corpo?.deslocX), deslocY: emMilimetros(corpo?.deslocY), atualizadoPor: user?.name || null };
  const antes = await lerCalibragem(prisma);
  await prisma.etiquetaCalibragem.upsert({ where: { id: CHAVE_ARGOX }, update: dados, create: { id: CHAVE_ARGOX, ...dados } });

  // Mudança de calibragem muda TODA etiqueta impressa daqui em diante — é exatamente o tipo de
  // ajuste que alguém vai querer rastrear quando um lote sair torto.
  await prisma.auditLog.create({
    data: {
      userId: user?.id || null, action: "CALIBRAR_ETIQUETA", entity: "EtiquetaCalibragem", entityId: CHAVE_ARGOX,
      diff: { antes, depois: { deslocX: dados.deslocX, deslocY: dados.deslocY }, por: user?.name || null },
    },
  }).catch(() => { /* auditoria não pode segurar a gravação */ });

  return NextResponse.json({ success: true, deslocX: dados.deslocX, deslocY: dados.deslocY });
}
