import "server-only";
import { usaCotas } from "./qualidade-campo";

// ─── QUAL GERADOR DESENHA CADA RELATÓRIO ──────────────────────────────────────
// Vitor (22/08/2026): "no link que enviamos o relatório para o inspetor apareceu em
// branco, precisa trazer o documento".
//
// A causa era divergência: a tela da Qualidade despachava por tipo para os geradores
// novos (EVS, ultrassom, pintura, LP), mas a rota pública do link de assinatura ainda
// caía no gerador ANTIGO para tudo que não fosse dimensional. Quem assinava recebia uma
// folha que não é o documento — e assinatura sobre folha errada é pior que link
// quebrado, porque parece que funcionou.
//
// ⚠ POR ISSO O DESPACHO MORA AQUI, e não duplicado nas duas rotas. Duas cópias da mesma
// decisão divergem na primeira vez que um tipo novo entra — foi exatamente o que
// aconteceu: o LP nasceu numa e não na outra.
export async function gerarPDFdoRelatorio({ rel, fotos = [], assinaturas = null, cliente = null, obra = null, refCliente = null, desenhoBytes = null }) {
  const dados = { rel, fotos, assinaturas, cliente, obra, refCliente };

  if (usaCotas(rel.tipo)) {
    const { gerarDimensionalPDF } = await import("./relatorio-dimensional-pdf");
    return gerarDimensionalPDF({ ...dados, desenhoBytes });
  }
  if (rel.tipo === "VISUAL_SOLDA") {
    const { gerarEVSPDF } = await import("./relatorio-evs-pdf");
    return gerarEVSPDF(dados);
  }
  if (rel.tipo === "ULTRASSOM") {
    const { gerarUSPDF } = await import("./relatorio-us-pdf");
    return gerarUSPDF(dados);
  }
  if (rel.tipo === "PINTURA") {
    const { gerarPinturaPDF } = await import("./relatorio-pintura-pdf");
    return gerarPinturaPDF(dados);
  }
  if (rel.tipo === "LP") {
    const { gerarLPPDF } = await import("./relatorio-lp-pdf");
    return gerarLPPDF(dados);
  }
  // Sais e poeira (Vitor, 02/10/2026) — modelos "Relatório de Sais" e "Relatório de Poeira" do SGQ
  if (rel.tipo === "SAIS") {
    const { gerarSaisPDF } = await import("./relatorio-sais-pdf");
    return gerarSaisPDF(dados);
  }
  if (rel.tipo === "POEIRA") {
    const { gerarPoeiraPDF } = await import("./relatorio-poeira-pdf");
    return gerarPoeiraPDF(dados);
  }
  // Pull-off e recebimento de tintas (02/10/2026) — modelos "Relatório de Pull-off" e "Relatório de
  // Recebimento de Tintas" do SGQ
  if (rel.tipo === "PULL_OFF") {
    const { gerarPullOffPDF } = await import("./relatorio-pulloff-pdf");
    return gerarPullOffPDF(dados);
  }
  if (rel.tipo === "RECEBIMENTO_TINTA") {
    const { gerarRecebimentoTintaPDF } = await import("./relatorio-recebimento-tinta-pdf");
    return gerarRecebimentoTintaPDF(dados);
  }
  // os recebimentos por certificado (07/10/2026): penetrante/revelador e arame de solda, no modelo da Torg
  if (rel.tipo === "RECEBIMENTO_PENETRANTE" || rel.tipo === "RECEBIMENTO_ARAME") {
    const { gerarRecebimentoRirPDF } = await import("./relatorio-recebimento-rir-pdf");
    return gerarRecebimentoRirPDF(dados);
  }
  // ⚠ tipo sem folha própria ainda sai como documento: o genérico é a rede de segurança,
  // não o padrão. Se um tipo novo cair aqui, sai um PDF pobre — mas sai.
  const { gerarRelatorioInspecaoPDF } = await import("./relatorio-inspecao-pdf");
  return gerarRelatorioInspecaoPDF({ rel, fotos, assinaturas, desenhoBytes });
}
