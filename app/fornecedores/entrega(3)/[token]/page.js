import MarketingShell from "@/components/MarketingShell";
import { prisma } from "@/lib/prisma";
import EntregaFornecedorForm from "./EntregaFornecedorForm";

export const metadata = {
  title: "Workspace Torg — Previsao de Entrega",
};

export default async function EntregaPorToken({ params }) {
  const pedido = await prisma.pedidoOmie.findUnique({
    where: { tokenEntrega: params.token },
    select: { id: true, dataEntregaReal: true },
  });

  if (!pedido) {
    return (
      <MarketingShell
        image="/obras/torre-escada.jpg"
        kicker="Portal do fornecedor"
        title="Link invalido"
        lead="O link que voce acessou nao e valido ou expirou."
      >
        <div className="text-center py-12">
          <p className="text-lg text-torg-gray">
            Token invalido ou pedido nao encontrado.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Verifique o link recebido por email ou entre em contato com a equipe de Compras da Torg Metal.
          </p>
        </div>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell
      image="/obras/torre-escada.jpg"
      kicker="Portal do fornecedor"
      title="Previsao de Entrega"
      lead="Informe a previsao atualizada de entrega para o pedido abaixo."
    >
      <EntregaFornecedorForm token={params.token} />
    </MarketingShell>
  );
}
