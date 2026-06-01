import MarketingShell from "@/components/MarketingShell";
import { Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { DADOS_TORG } from "@/lib/empresa";
import CotacaoFornecedorForm from "./CotacaoFornecedorForm";


export const metadata = {
  title: "Workspace Torg — Upload de Cotação",
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function CotacaoPorToken({ params }) {
  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    include: {
      rm: {
        select: {
          id: true, numero: true, descricao: true, observacao: true,
          op: {
            select: {
              numero: true, cliente: true, obra: true,
              clienteRazaoSocial: true, clienteCnpj: true, clienteIE: true,
              clienteEndereco: true, clienteCidade: true, clienteUF: true,
              clienteCep: true, clienteContato: true, clienteEmail: true,
              clienteTelefone: true,
            },
          },
        },
      },
      itens: {
        include: {
          rmItem: {
            select: {
              descricao: true, qtd: true, unidade: true, material: true,
              comprimento: true, largura: true, tratamento: true,
              peso: true, codigo: true,
              rmId: true,
              rm: { select: { numero: true } },
              opItem: { select: { faturamentoDireto: true } },
              aditivoItem: { select: { faturamentoDireto: true } },
            },
          },
        },
      },
    },
  });

  // Token inválido
  if (!cotacao) {
    return (
      <MarketingShell
        image="/obras/torre-escada.jpg"
        kicker="Cotação não encontrada"
        title="Link inválido ou expirado"
        lead="O link de acesso a essa cotação não foi reconhecido. Verifique se você abriu o link correto ou fale com o comprador."
      >
        <div className="bg-white rounded-2xl border border-red-200 p-7">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle size={22} className="text-red-600" />
          </div>
          <p className="text-sm text-torg-gray">
            Token inválido. Se você recebeu esse link recentemente, talvez tenha sido cancelado.
          </p>
        </div>
      </MarketingShell>
    );
  }

  // Vencida
  const vencida = cotacao.prazoResposta && new Date(cotacao.prazoResposta) < new Date();

  if (cotacao.status === "CANCELADA") {
    return (
      <MarketingShell
        image="/obras/torre-escada.jpg"
        kicker="Cotação encerrada"
        title="Esta cotação foi cancelada"
        lead="O comprador da Torg cancelou esta solicitação. Em caso de dúvida, fale diretamente com ele."
      >
        <div className="bg-white rounded-2xl border border-gray-200 p-7">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
            <Lock size={22} className="text-torg-gray" />
          </div>
          <p className="text-sm text-torg-gray">Token: {params.token.slice(0, 8)}...</p>
        </div>
      </MarketingShell>
    );
  }

  // Modo "Revisao Final" — quando Compras solicitou ao fornecedor que ele
  // revise APENAS os itens em que ele venceu, pra confirmar valores finais.
  // Nesse modo, filtramos cotacao.itens pra mostrar so vencedor=true.
  const emRevisaoFinal = !!cotacao.solicitadaRevisaoFinal;
  if (emRevisaoFinal) {
    cotacao.itens = (cotacao.itens || []).filter((it) => it.vencedor === true);
  }

  // Carrega anexos de todas as RMs envolvidas (primaria + qualquer outra
  // que tenha rmItem referenciado nos CotacaoItens — caso consolidada).
  const rmIdsEnvolvidos = new Set([cotacao.rmId]);
  for (const it of cotacao.itens || []) {
    if (it.rmItem?.rmId) rmIdsEnvolvidos.add(it.rmItem.rmId);
  }
  const [anexosRM, anexosCotacao] = await Promise.all([
    prisma.anexo.findMany({
      where: { rmId: { in: Array.from(rmIdsEnvolvidos) } },
      include: { rm: { select: { numero: true } } },
      orderBy: { uploadedAt: "asc" },
    }),
    prisma.anexo.findMany({
      where: { cotacaoId: cotacao.id },
      orderBy: { uploadedAt: "asc" },
    }),
  ]);

  // Pendente — mostrar formulário
  const data = JSON.parse(JSON.stringify(cotacao));
  const anexosRMData = JSON.parse(JSON.stringify(anexosRM));
  const anexosCotacaoData = JSON.parse(JSON.stringify(anexosCotacao));

  // Deriva faturamento: campo da Cotacao OU fallback pelos itens (cotações antigas
  // criadas antes do fix podem ter faturamento="Torg" mas itens FD).
  const isFD =
    cotacao.faturamento === "Cliente" ||
    (cotacao.itens || []).some(
      (ci) =>
        ci.rmItem?.opItem?.faturamentoDireto ||
        ci.rmItem?.aditivoItem?.faturamentoDireto
    );

  // Monta dados de faturamento. Se faturamento direto,
  // mostra dados do cliente da OP (mesmo que incompletos — o painel avisa).
  let faturamento;
  if (isFD) {
    const op = cotacao.rm?.op;
    faturamento = {
      tipo: "Cliente",
      razaoSocial: op?.clienteRazaoSocial || null,
      cnpj: op?.clienteCnpj || null,
      inscricaoEstadual: op?.clienteIE || null,
      endereco: op?.clienteEndereco || null,
      cidade: op?.clienteCidade || null,
      uf: op?.clienteUF || null,
      cep: op?.clienteCep || null,
      contato: op?.clienteContato || null,
      email: op?.clienteEmail || null,
      telefone: op?.clienteTelefone || null,
      opNumero: op?.numero || null,
      opCliente: op?.cliente || null,
      opObra: op?.obra || null,
    };
  } else {
    faturamento = {
      tipo: "Torg",
      razaoSocial: DADOS_TORG.razaoSocial,
      nomeFantasia: DADOS_TORG.nomeFantasia,
      cnpj: DADOS_TORG.cnpj,
      inscricaoEstadual: DADOS_TORG.inscricaoEstadual,
      endereco: DADOS_TORG.endereco,
      bairro: DADOS_TORG.bairro,
      cidade: DADOS_TORG.cidade,
      uf: DADOS_TORG.uf,
      cep: DADOS_TORG.cep,
      email: DADOS_TORG.email,
      telefone: DADOS_TORG.telefone,
    };
  }

  return (
    <CotacaoFornecedorForm
      cotacao={data}
      anexos={anexosRMData}
      anexosCotacao={anexosCotacaoData}
      vencida={vencida}
      faturamento={faturamento}
      emRevisaoFinal={emRevisaoFinal}
    />
  );
}
