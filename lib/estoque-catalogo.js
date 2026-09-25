// O que a tela Compras › Estoque › Catálogo Omie recebe do servidor.
import { prisma } from "@/lib/prisma";
import { AGENDA, descreverAgenda } from "@/lib/cron-agenda";

const CONFIG_PADRAO = { categoriasOmie: ["3.1"], ultimaSincProd: null, ultimaSincMov: null };

export async function carregarCatalogoOmie() {
  const [itens, config] = await Promise.all([
    prisma.estoqueItem.findMany({
      where: { ativo: true },
      orderBy: { descricao: "asc" },
      // ⚠⚠ SEM `take`. Era `take: 1000` em ordem alfabética, com a busca e os filtros rodando no
      // NAVEGADOR sobre o que chegou: dos 2.500 produtos ativos a tela recebia até "INDUSDUR…", e 419
      // dos 657 com posição no Omie — todos os 196 PERFIL e 52 TUBO — nunca apareciam, nem buscando
      // pelo nome (25/09/2026). Filtrar depois de cortar esconde dado. Só os campos que a tela lê.
      select: {
        id: true, codigoOmie: true, descricao: true, categoriaOmie: true, categoriaLabel: true,
        unidade: true, cmc: true, qtdAtual: true, locaisQtd: true, ultimaSincOmie: true,
      },
    }),
    prisma.configEstoque.findFirst(),
  ]);
  return {
    itens: JSON.parse(JSON.stringify(itens)),
    config: JSON.parse(JSON.stringify(config || CONFIG_PADRAO)),
    agendaCron: {
      produtos: descreverAgenda(AGENDA.get("/api/cron/estoque-produtos")),
      movimentacoes: descreverAgenda(AGENDA.get("/api/cron/estoque-movimentacoes")),
    },
  };
}
