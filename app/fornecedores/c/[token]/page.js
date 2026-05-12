import MarketingShell from "@/components/MarketingShell";
import { Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import CotacaoFornecedorForm from "./CotacaoFornecedorForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace Torg — Upload de Cotação",
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function CotacaoPorToken({ params }) {
  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    include: {
      rm: { select: { id: true, numero: true, descricao: true, observacao: true } },
      itens: {
        include: {
          rmItem: {
            select: {
              descricao: true, qtd: true, unidade: true, material: true,
              comprimento: true, largura: true, tratamento: true,
              peso: true, codigo: true,
              rmId: true,
              rm: { select: { numero: true } },
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

  // Carrega anexos de todas as RMs envolvidas (primaria + qualquer outra
  // que tenha rmItem referenciado nos CotacaoItens — caso consolidada).
  const rmIdsEnvolvidos = new Set([cotacao.rmId]);
  for (const it of cotacao.itens || []) {
    if (it.rmItem?.rmId) rmIdsEnvolvidos.add(it.rmItem.rmId);
  }
  const anexos = await prisma.anexo.findMany({
    where: { rmId: { in: Array.from(rmIdsEnvolvidos) } },
    include: { rm: { select: { numero: true } } },
    orderBy: { uploadedAt: "asc" },
  });

  // Pendente — mostrar formulário
  const data = JSON.parse(JSON.stringify(cotacao));
  const anexosData = JSON.parse(JSON.stringify(anexos));

  return (
    <CotacaoFornecedorForm cotacao={data} anexos={anexosData} vencida={vencida} />
  );
}
