// PATCH /api/rh/cargos/[id] — edita um cargo (corrige cadastro inserido errado)
// e, quando o NOME muda, propaga o novo nome para a planilha de controle no
// SharePoint (BASE FUNCIONÁRIOS), que guarda o cargo em texto por funcionário.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { syncCargoRename } from "@/lib/sharepoint-rh";

const cargoSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  nivel: z.enum(["OPERACIONAL", "TECNICO", "SUPERVISAO", "GERENCIA", "DIRETORIA"]).optional().nullable(),
  categoria: z.string().optional().nullable(),
  salarioBase: z.number().optional().nullable(),
  cbo: z.string().optional().nullable(),
});

const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { id } = await params;

    const parsed = cargoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const atual = await prisma.cargo.findUnique({ where: { id }, select: { id: true, nome: true } });
    if (!atual) {
      return NextResponse.json({ success: false, error: "Cargo não encontrado" }, { status: 404 });
    }

    const renomeou = norm(data.nome) !== norm(atual.nome);

    // Evita criar duplicata ao renomear (nomes de cargo são tratados como únicos
    // na importação, mesmo sem @unique no schema).
    if (renomeou) {
      const dup = await prisma.cargo.findFirst({
        where: { id: { not: id }, ativo: true, nome: { equals: data.nome, mode: "insensitive" } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json({ success: false, error: "Já existe um cargo com esse nome" }, { status: 409 });
      }
    }

    const cargo = await prisma.cargo.update({
      where: { id },
      data: {
        nome: data.nome,
        nivel: data.nivel || null,
        categoria: data.categoria || null,
        salarioBase: data.salarioBase ?? null,
        cbo: data.cbo || null,
      },
      select: {
        id: true, nome: true, nivel: true, categoria: true, salarioBase: true, cbo: true,
        _count: { select: { funcionarios: { where: { ativo: true } } } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "EDITAR_CARGO",
        entity: "Cargo",
        entityId: id,
        diff: { nomeAntes: atual.nome, nomeDepois: cargo.nome },
      },
    }).catch(() => {});

    // Propaga a renomeação para a planilha do SharePoint (o cargo fica gravado
    // como texto na linha de cada funcionário ativo que o utiliza).
    let planilha = null;
    let funcionariosAfetados = 0;
    if (renomeou) {
      const funcionarios = await prisma.funcionario.findMany({
        where: { cargoId: id, ativo: true },
        select: { nome: true, matricula: true },
      });
      funcionariosAfetados = funcionarios.length;
      if (funcionarios.length > 0) {
        // Aguarda para garantir a atualização da planilha e reportar o resultado,
        // mas nunca derruba a edição se o SharePoint falhar.
        planilha = await syncCargoRename({ nomeAntes: atual.nome, nomeNovo: cargo.nome, funcionarios })
          .catch((e) => ({ success: false, error: e?.message }));
      }
    }

    return NextResponse.json({ success: true, data: cargo, funcionariosAfetados, planilha });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
