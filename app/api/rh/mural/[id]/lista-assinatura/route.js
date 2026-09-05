// GET /api/rh/mural/[id]/lista-assinatura — lista de presença em PDF, para a fábrica assinar.
//
// Vitor (30/08/2026): "no caso dos funcionários da fábrica pegamos uma lista que vc já gera o
// modelo (…) pode ser uma só" e "vamos começar a salvar na pasta workspace na pasta RH do
// SharePoint, vc já cria uma pasta, já fala de qual campanha é e a data".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarListaAssinaturaPDF } from "@/lib/lista-assinatura-pdf";
import { arquivarForm } from "@/lib/arquivar-form";
import { dispArquivo } from "@/lib/arquivo-http";
import { dataBR, hojeBRT } from "@/lib/data-br";
import { log } from "@/lib/log";

const registroLog = log("api/rh/mural/[id]/lista-assinatura");

export const runtime = "nodejs";
export const maxDuration = 60;

const slugPasta = (s) =>
  String(s || "campanha").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const aviso = await prisma.muralAviso.findUnique({ where: { id: params.id } });
  if (!aviso) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

  // ⚠ QUEM ENTRA NA LISTA: funcionário ativo SEM usuário do portal. Quem tem login registra pelo
  // modal; quem não tem registra no papel. A soma dos dois é a empresa inteira, sem ninguém contado
  // duas vezes — e é isso que faz o número final fechar.
  // ⚠⚠ NÃO BASTA `usuario: null`. O vínculo User↔Funcionario só é preenchido no autoatendimento
  // (tipo FUNCIONARIO): dos 70 ativos, só 8 estavam ligados, e a Diretoria inteira — que tem login —
  // caía na lista de papel. O e-mail resgata esses. Errar para MAIS é seguro (a pessoa assina duas
  // vezes); errar para menos deixaria alguém sem registro em lugar nenhum.
  const [todos, usuarios] = await Promise.all([
    prisma.funcionario.findMany({
      where: { ativo: true },
      select: { nome: true, email: true, matricula: true, usuario: { select: { id: true } },
                cargo: { select: { nome: true } }, setor: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    }),
    prisma.user.findMany({ where: { ativo: true }, select: { email: true } }),
  ]);
  const comPortal = new Set(usuarios.map((u) => (u.email || "").toLowerCase().trim()).filter(Boolean));
  const pessoas = todos.filter((f) => !f.usuario && !(f.email && comPortal.has(f.email.toLowerCase().trim())));
  if (!pessoas.length) {
    return NextResponse.json({ error: "Todos os funcionários ativos já têm acesso ao portal — não há lista de papel a emitir." }, { status: 409 });
  }

  const doc = await gerarListaAssinaturaPDF({
    titulo: aviso.titulo,
    subtitulo: "Confirmo que assisti ao comunicado acima.",
    pessoas: pessoas.map((p) => ({
      nome: p.nome, matricula: p.matricula || "",
      cargo: p.cargo?.nome || "", setor: p.setor?.nome || "",
    })),
  });

  // ⚠ ARQUIVA JÁ NA EMISSÃO, numa pasta que se identifica sozinha: nome da campanha e data. Quem
  // abrir a pasta daqui a um ano precisa saber do que se trata sem perguntar a ninguém — e é onde a
  // lista assinada volta depois, ao lado do modelo que saiu.
  const pasta = `/RH/Workspace/Campanhas/${hojeBRT()} - ${slugPasta(aviso.titulo)}`;
  const arq = await arquivarForm({ pasta, nomeArquivo: doc.filename, bytes: doc.bytes });
  if (!arq.ok) registroLog.erro("[lista-assinatura] arquivamento:", arq.erro);

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "EMITIR_LISTA_ASSINATURA", entity: "MuralAviso", entityId: aviso.id,
      diff: { pessoas: pessoas.length, pasta, arquivado: arq.ok, emitidaEm: dataBR(new Date()) },
    },
  }).catch(() => {});

  return new NextResponse(Buffer.from(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(doc.filename, "inline"),
      "Cache-Control": "no-store",
    },
  });
}
