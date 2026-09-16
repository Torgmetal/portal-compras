import Link from "next/link";
import { requireRole } from "@/lib/session";
import RMsTabelaSeletor from "./RMsTabelaSeletor";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/log";
import { buscarRMsDoPainel, agregarCotacoes, normalizarOp, LIMITE_SEM_OBRA } from "@/lib/rms-painel";

const registro = log("compras");

// Sempre busca dados frescos do banco (sem cache de Server Component)

/** Preserva a obra escolhida ao alternar Ativas/Histórico — trocar de aba não é trocar de obra. */
const href = (arquivadas, op) => {
  const q = new URLSearchParams();
  if (arquivadas) q.set("arquivadas", "1");
  if (op) q.set("op", op);
  const s = q.toString();
  return s ? `/compras?${s}` : "/compras";
};

export default async function PainelCompras({ searchParams }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);
  const verArquivadas = searchParams?.arquivadas === "1";
  const opSelecionada = normalizarOp(searchParams?.op);

  const [{ rms, obras, total, truncada }, categoriasCustom] = await Promise.all([
    buscarRMsDoPainel("ENGENHARIA", verArquivadas, opSelecionada),
    // Categorias customizadas de fornecedor, para os filtros do modal de envio de cotação
    prisma.categoriaFornecedor.findMany({
      where: { ativa: true },
      orderBy: [{ ordem: "asc" }, { label: "asc" }],
    }),
  ]);

  await agregarCotacoes(rms, registro, "/compras");

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">RMs — Materiais</h2>
          <p className="text-sm text-torg-gray mt-1">RMs de Engenharia · Vinculadas a OPs</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={href(false, opSelecionada)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              !verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Ativas
          </Link>
          <Link
            href={href(true, opSelecionada)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Histórico
          </Link>
        </div>
      </div>

      {/* ⚠⚠ A TELA VAZIA MANTÉM O CABEÇALHO (Matheus, 16/09/2026: "quando não tem RM eu preciso que
          mesmo assim apareça esse cabeçalho 0 0 0, fica melhor o visual"). Antes, lista vazia
          trocava o componente INTEIRO por um cartão de aviso — e junto iam embora os contadores,
          o seletor de OP e o Tabela/Kanban. Some a régua da tela, e quem chega não sabe se está no
          lugar certo, se o filtro escondeu tudo ou se o portal quebrou. Com os três zeros de pé, a
          resposta é imediata: é aqui, e está zerado.

          ⚠ O estado vazio não some — mudou de lugar: a própria tabela diz "Nenhuma RM nesta lista"
          na linha do corpo, e distingue isso de "o filtro escondeu tudo", que tem desfazer.

          ⚠⚠ `key` POR ESCOPO: trocar de obra ou de aba REMONTA o componente, zerando seleção em
          massa, modal e funis. Sem isso dava para marcar RMs da OP-060, trocar para a OP-097 e
          disparar uma cotação consolidada com as RMs da obra anterior — o contador lê
          `selecionadas.size` e o envio lê a interseção com `rms`, então os dois nem concordariam
          sobre o que estava indo. */}
      <RMsTabelaSeletor
        key={`ENGENHARIA-${verArquivadas ? "hist" : "ativas"}-${opSelecionada || "todas"}`}
        rms={JSON.parse(JSON.stringify(rms))}
        isAdmin={user.role === "ADMIN"}
        categoriasCustom={JSON.parse(JSON.stringify(categoriasCustom))}
        verArquivadas={verArquivadas}
        obras={obras}
        opSelecionada={opSelecionada}
        totalNoEscopo={total}
        truncada={truncada}
        limite={LIMITE_SEM_OBRA}
        basePath="/compras"
      />
    </div>
  );
}
