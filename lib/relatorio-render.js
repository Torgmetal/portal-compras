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
  // ⚠ tipo sem folha própria ainda sai como documento: o genérico é a rede de segurança,
  // não o padrão. Se um tipo novo cair aqui, sai um PDF pobre — mas sai.
  const { gerarRelatorioInspecaoPDF } = await import("./relatorio-inspecao-pdf");
  return gerarRelatorioInspecaoPDF({ rel, fotos, assinaturas, desenhoBytes });
}
