// Romaneios Terceirizados — controle À PARTE (sem vínculo com o romaneio da obra).
// GET  — lista os romaneios + o próximo número sugerido (série própria RT-##).
// POST — cria um romaneio de envio a terceiro (material que sai pra trabalhar fora).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRomaneioTerceiroForm22 } from "@/lib/romaneio-terceiro-form22";
import { computarMateriaisEnvio } from "@/lib/materiais-terceiro";
import { uploadFileToFolder, pastaRomaneiosTerceiro } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PCP/PLANEJAMENTO incluídos: o romaneio pode ser criado pelo painel de Liberar (despacho).
const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ALMOXARIFADO", "PCP", "PLANEJAMENTO"];
// Pasta À PARTE dos romaneios de obra (que ficam em cada OP/4. Expedição/4.2 Romaneios).
const PASTA_ROMANEIOS_TERCEIROS = "/Ordem de Servico/01. OP/Romaneios terceiros";

const itemSchema = z.object({
  marca: z.string().min(1),
  descricao: z.string().optional().nullable(),
  qte: z.number().nullable().optional(),
  pesoUn: z.number().nullable().optional(),
  pesoTotal: z.number().nullable().optional(),
});
const schema = z.object({
  fornecedorId: z.string().nullable().optional(),
  terceiroNome: z.string().min(1, "Informe o terceiro."),
  servico: z.string().max(200).nullable().optional(),
  opRefId: z.string().nullable().optional(),
  opRefNumero: z.string().nullable().optional(),
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placaVeiculo: z.string().max(20).nullable().optional(),
  placaCarreta: z.string().max(20).nullable().optional(),
  contatoTransporte: z.string().max(200).nullable().optional(),
  itens: z.array(itemSchema).min(1, "Adicione ao menos uma peça."),
  dataEnvio: z.string().nullable().optional(),
  dataPrevRetorno: z.string().nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  // Para o 2º romaneio de MATERIAL (só Corte/Montagem): ids das peças + etapa de envio.
  pecaIds: z.array(z.string()).optional(),
  setorEnvio: z.string().max(20).nullable().optional(),
  chapaModo: z.enum(["INTEIRA", "CORTADA"]).optional(), // como contar as chapas no romaneio de material
});

// pesoTotal do item: usa o informado, senão qte × pesoUn.
function pesoDoItem(it) {
  if (it.pesoTotal != null) return Number(it.pesoTotal) || 0;
  if (it.qte != null && it.pesoUn != null) return (Number(it.qte) || 0) * (Number(it.pesoUn) || 0);
  return 0;
}

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const where = {};
  if (status && status !== "todos") where.status = status;
  // Filtro por OP (usado pela aba Terceiros do painel da OP).
  const opId = sp.get("opId");
  const opNumero = sp.get("opNumero");
  if (opId) where.opRefId = opId;
  else if (opNumero) where.opRefNumero = opNumero;

  const [rows, ult] = await Promise.all([
    prisma.romaneioTerceiro.findMany({ where, orderBy: [{ createdAt: "desc" }] }),
    prisma.romaneioTerceiro.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } }),
  ]);
  return NextResponse.json({ success: true, romaneios: rows, proximoNumero: (ult?.numero || 0) + 1 });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  // dedupe por marca; normaliza peso
  const porMarca = new Map();
  for (const it of body.itens) {
    const k = it.marca.trim().toUpperCase();
    if (k && !porMarca.has(k)) {
      porMarca.set(k, {
        marca: it.marca.trim(), descricao: it.descricao?.trim() || null,
        qte: it.qte ?? null, pesoUn: it.pesoUn ?? null, pesoTotal: pesoDoItem(it),
      });
    }
  }
  const itens = [...porMarca.values()];
  const pesoEnviadoKg = itens.reduce((s, i) => s + (i.pesoTotal || 0), 0);

  // 2º romaneio de MATERIAL (perfis a cortar) — só saindo da Preparação/Montagem.
  const setorEnvio = body.setorEnvio ? String(body.setorEnvio).toUpperCase() : null;
  const materiais = await computarMateriaisEnvio({ pecaIds: body.pecaIds || [], setorEnvio, chapaModo: body.chapaModo }).catch(() => []);

  // corrida por número: tenta o próximo e sobe se colidir com a unique
  let criado = null;
  const ult = await prisma.romaneioTerceiro.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  let n = (ult?.numero || 0) + 1;
  for (let tent = 0; tent < 5 && !criado; tent++) {
    try {
      criado = await prisma.romaneioTerceiro.create({
        data: {
          numero: n,
          fornecedorId: body.fornecedorId || null,
          terceiroNome: body.terceiroNome.trim(),
          servico: body.servico?.trim() || null,
          opRefId: body.opRefId || null,
          opRefNumero: body.opRefNumero?.trim() || null,
          transportadora: body.transportadora?.trim() || null,
          motorista: body.motorista?.trim() || null,
          placaVeiculo: body.placaVeiculo?.trim() || null,
          placaCarreta: body.placaCarreta?.trim() || null,
          contatoTransporte: body.contatoTransporte?.trim() || null,
          itens, pesoEnviadoKg,
          setorEnvio, materiais,
          dataEnvio: body.dataEnvio ? new Date(body.dataEnvio) : new Date(),
          dataPrevRetorno: body.dataPrevRetorno ? new Date(body.dataPrevRetorno) : null,
          observacao: body.observacao?.trim() || null,
          status: "ENVIADO",
          criadoPorId: user.id, criadoNome: user.name || null,
        },
      });
    } catch (e) {
      if (String(e?.code) === "P2002") n++; else throw e;
    }
  }
  if (!criado) return NextResponse.json({ error: "Não foi possível numerar o romaneio." }, { status: 409 });

  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_ROMANEIO_TERCEIRO", entity: "RomaneioTerceiro", entityId: criado.id, diff: { numero: criado.numero, terceiro: criado.terceiroNome, pesoEnviadoKg, itens: itens.length } } }).catch(() => {});

  // Best-effort: sobe os romaneios (FORM 22) pra pasta "Romaneios terceiros" no SharePoint e grava
  // os arquivoUrl. 1º = PEÇAS (sempre); 2º = MATERIAL (só se houver materiais = Corte/Montagem).
  // Não derruba a criação se o SharePoint falhar; registra o erro no auditLog p/ rastreio.
  const XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const rt = `RT-${String(criado.numero).padStart(3, "0")}`;
  const sufOP = criado.opRefNumero ? `-OP-${criado.opRefNumero}` : "";
  // Salva DENTRO da OP: {OP}/4. Expedição/4.7 Romaneios enviados a terceiros. Se não achar a pasta
  // da OP (ou não houver OP), cai no fallback global. Não deriva a criação se o SharePoint falhar.
  let pasta = PASTA_ROMANEIOS_TERCEIROS;
  try {
    const p = await pastaRomaneiosTerceiro(criado.opRefNumero);
    if (p) pasta = p;
  } catch {}
  try {
    const buf = await gerarRomaneioTerceiroForm22(criado);
    const up = await uploadFileToFolder({ folderPath: pasta, fileName: `Romaneio-Terceiro-${rt}${sufOP}.xlsx`, buffer: buf, contentType: XLSX_CT });
    if (up?.webUrl) { await prisma.romaneioTerceiro.update({ where: { id: criado.id }, data: { arquivoUrl: up.webUrl } }); criado.arquivoUrl = up.webUrl; }
    if (Array.isArray(criado.materiais) && criado.materiais.length) {
      const bufM = await gerarRomaneioTerceiroForm22(criado, { material: true });
      const upM = await uploadFileToFolder({ folderPath: pasta, fileName: `Romaneio-Terceiro-${rt}${sufOP}-MATERIAL.xlsx`, buffer: bufM, contentType: XLSX_CT });
      if (upM?.webUrl) { await prisma.romaneioTerceiro.update({ where: { id: criado.id }, data: { arquivoMaterialUrl: upM.webUrl } }); criado.arquivoMaterialUrl = upM.webUrl; }
    }
  } catch (e) {
    console.error("[terceiros] SharePoint upload:", e?.message);
    await prisma.auditLog.create({ data: { userId: user.id, action: "ROMANEIO_TERCEIRO_SHAREPOINT_ERRO", entity: "RomaneioTerceiro", entityId: criado.id, diff: { erro: String(e?.message || e).slice(0, 300), pasta } } }).catch(() => {});
  }

  return NextResponse.json({ success: true, romaneio: criado });
}
