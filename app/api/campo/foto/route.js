// POST — sobe a foto tirada no celular e grava a evidência.
// GET  — o que já foi enviado (para o inspetor conferir sem sair da tela).
//
// A foto chega JÁ REDUZIDA a JPEG pelo próprio aparelho. Dois motivos: o iPhone fotografa em HEIC,
// que o PDF do data book não lê, e a foto crua de celular passa de 4 MB — tamanho em que a rota
// serverless trava (ver [[torg_upload_4mb]]). Reduzir na origem resolve os dois de uma vez e ainda
// deixa o envio rápido no 4G do galpão.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO, tipoValido, ORIGENS_MARCA } from "@/lib/qualidade-campo";
import { evidenciaValida } from "@/lib/fotos-evidencia";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX = 12 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png"]);

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Storage de arquivos não configurado." }, { status: 500 });
  }

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Envie a imagem." }, { status: 400 }); }

  const file = form.get("file");
  const opId = String(form.get("opId") || "") || null;
  const opNumero = String(form.get("opNumero") || "").trim();
  const tipo = String(form.get("tipo") || "").trim();
  const marca = String(form.get("marca") || "").trim() || null;
  // ⚠ FOTO PODE NASCER JÁ AMARRADA A UM RELATÓRIO. Vitor (21/08/2026): "falta o botão para tirar
  // foto no relatório". Sem isto ela cai na fila de fotos soltas e alguém precisa juntá-la depois,
  // no computador — e a evidência de uma junta reprovada é justamente o que não pode se perder no
  // caminho.
  const relatorioId = String(form.get("relatorioId") || "").trim() || null;
  const origemMarca = String(form.get("origemMarca") || "").trim() || null;
  // ⚠ a ÁREA de evidência (rugosidade, salinidade, espessura…) — é ela que faz a foto cair na
  // moldura certa da folha 2 em vez de virar mais uma imagem solta no fim do PDF.
  const evidencia = String(form.get("evidencia") || "").trim() || null;
  const observacao = String(form.get("observacao") || "").trim().slice(0, 500) || null;
  // instrumentos marcados no celular, em SNAPSHOT — ver o comentário do modelo
  let equipamentos = null;
  try {
    const bruto = JSON.parse(String(form.get("equipamentos") || "[]"));
    if (Array.isArray(bruto) && bruto.length) {
      equipamentos = bruto.slice(0, 12).map((e) => ({
        id: String(e?.id || ""),
        nome: String(e?.nome || "").slice(0, 160),
        codigo: e?.codigo ? String(e.codigo).slice(0, 40) : null,
        certificado: e?.certificado ? String(e.certificado).slice(0, 60) : null,
        validade: e?.validade ? String(e.validade).slice(0, 10) : null,
        vencido: !!e?.vencido,
      })).filter((e) => e.id && e.nome);
    }
  } catch { /* lista inválida não impede a foto: a evidência vale mais que o metadado */ }

  if (!file || typeof file === "string") return NextResponse.json({ error: "Campo 'file' obrigatório." }, { status: 400 });
  if (!opNumero) return NextResponse.json({ error: "Escolha a OP." }, { status: 400 });
  if (!tipoValido(tipo)) return NextResponse.json({ error: "Tipo de relatório inválido." }, { status: 400 });
  if (origemMarca && !ORIGENS_MARCA.includes(origemMarca)) return NextResponse.json({ error: "Origem da marca inválida." }, { status: 400 });
  if (!evidenciaValida(tipo, evidencia)) return NextResponse.json({ error: "Área de evidência inválida." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: `Imagem muito grande (máx ${MAX / 1024 / 1024} MB).` }, { status: 413 });

  const mime = (file.type || "").toLowerCase();
  if (!TIPOS.has(mime)) return NextResponse.json({ error: "Formato não aceito — envie JPG." }, { status: 415 });

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = mime === "image/png" ? "png" : "jpg";
  const blob = await put(`qualidade/campo/${opNumero}/${tipo}/foto.${ext}`, buf, {
    access: "public", addRandomSuffix: true, contentType: mime,
  });

  const foto = await prisma.fotoInspecao.create({
    data: {
      opId, opNumero, tipo, marca, origemMarca, observacao, equipamentos, relatorioId, evidencia,
      url: blob.url, tamanho: buf.length,
      // quem tirou é o que faz a foto valer como evidência — sem isso é só uma imagem
      autorId: user.id, autorNome: user.name || user.email || null,
    },
    select: { id: true, url: true, marca: true, origemMarca: true, observacao: true, equipamentos: true, capturadaEm: true, evidencia: true },
  });

  return NextResponse.json({ ok: true, foto });
}

export async function GET(req) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const opNumero = url.searchParams.get("opNumero");
  const tipo = url.searchParams.get("tipo");
  // ⚠ por RELATÓRIO também: a tela de medição precisa mostrar as fotos daquele documento, e não
  // todas as da OP — que são dezenas e de outros relatórios.
  const relatorioId = url.searchParams.get("relatorioId");
  if (!opNumero && !relatorioId) return NextResponse.json({ fotos: [] });

  const fotos = await prisma.fotoInspecao.findMany({
    where: relatorioId ? { relatorioId } : { opNumero, ...(tipo ? { tipo } : {}) },
    select: { id: true, url: true, marca: true, origemMarca: true, observacao: true, equipamentos: true, capturadaEm: true, autorNome: true, tipo: true, evidencia: true },
    orderBy: { capturadaEm: relatorioId ? "asc" : "desc" },
    take: 60,
  });
  return NextResponse.json({ fotos });
}

// PATCH — muda a ÁREA de evidência de uma foto que já está no relatório.
//
// ⚠ Existe por causa do acervo: as fotos anteriores a 04/09/2026 não têm área, e sem um jeito de
// classificar elas continuariam para sempre fora das molduras. Serve também para quem anexou no
// bloco errado — sem isso a saída seria apagar a evidência e fotografar de novo.
export async function PATCH(req) {
  let user;
  try { user = await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let corpo;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Corpo inválido." }, { status: 400 }); }
  const id = String(corpo?.id || "");
  const evidencia = String(corpo?.evidencia || "").trim() || null;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const foto = await prisma.fotoInspecao.findUnique({ where: { id }, select: { tipo: true, relatorioId: true } });
  if (!foto) return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  if (!evidenciaValida(foto.tipo, evidencia)) return NextResponse.json({ error: "Área de evidência inválida." }, { status: 400 });

  // mesma trava do DELETE: documento enviado para assinatura não se remonta
  const rel = foto.relatorioId
    ? await prisma.relatorioInspecao.findUnique({ where: { id: foto.relatorioId }, select: { envioAssinaturaId: true, codigo: true } })
    : null;
  if (rel?.envioAssinaturaId) {
    return NextResponse.json({ error: `A foto faz parte do ${rel.codigo}, que já foi enviado para assinatura.` }, { status: 409 });
  }

  await prisma.fotoInspecao.update({ where: { id }, data: { evidencia } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  let user;
  try { user = await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const foto = await prisma.fotoInspecao.findUnique({ where: { id }, select: { autorId: true, relatorioId: true } });
  if (!foto) return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });

  // ⚠ `FotoInspecao.relatorioId` é campo solto, sem relação declarada no schema — o relatório vem
  // numa consulta à parte.
  const rel = foto.relatorioId
    ? await prisma.relatorioInspecao.findUnique({ where: { id: foto.relatorioId }, select: { envioAssinaturaId: true, codigo: true } })
    : null;
  // ⚠ FOTO DE RELATÓRIO JÁ ENVIADO PARA ASSINATURA não se apaga: ela virou evidência de um
  // documento que alguém validou. Antes a regra barrava QUALQUER foto ligada a relatório — mas
  // agora a foto nasce amarrada ao relatório na hora de medir, e errar o enquadramento no chão de
  // fábrica é comum. Enquanto o documento é rascunho, quem tirou pode refazer.
  if (rel?.envioAssinaturaId) {
    return NextResponse.json({ error: `A foto faz parte do ${rel.codigo}, que já foi enviado para assinatura.` }, { status: 409 });
  }
  // e cada um apaga a própria — engano na hora de fotografar é comum, apagar a do colega não
  if (foto.autorId && foto.autorId !== user.id && user.tipo !== "ADMIN") {
    return NextResponse.json({ error: "Só quem tirou a foto pode removê-la." }, { status: 403 });
  }

  await prisma.fotoInspecao.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
