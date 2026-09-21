"use client";
import { FileSpreadsheet, FileText } from "lucide-react";

/**
 * Baixar a conferência em PDF ou Excel.
 *
 * ⚠⚠ SÃO LINKS, NÃO `fetch` + BLOB. A conferência é usada no CELULAR, no pátio: um `<a download>`
 * entrega o arquivo ao navegador, que sabe abrir o PDF e mandar a planilha para o app de
 * planilhas. Montar blob no cliente, além de exigir a tela ter os dados, morre quando a aba fica
 * em segundo plano — que é o que acontece quando o download demora e o operador troca de tela.
 *
 * ⚠ Estes `<a>` NUNCA podem ficar dentro de outro `<a>` — âncora aninhada é HTML inválido, o React
 * acusa erro de hidratação e o navegador reescreve a árvore sozinho, quebrando o clique E o
 * download. Foi o que aconteceu na primeira versão do cartão da lista, que era um `<Link>`
 * inteiro; hoje o link cobre só o conteúdo e este rodapé é irmão dele.
 *
 * ⚠ `stopPropagation` continua: em qualquer lugar onde o bloco à volta seja clicável, tocar em
 * "PDF" tem de baixar, não navegar.
 */
export default function BotoesRelatorioConferencia({ id, compacto = false }) {
  const base = `/api/expedicao/conferencia/${id}/relatorio`;
  const cls = compacto
    ? "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-torg-gray hover:border-torg-blue hover:text-torg-blue"
    : "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-torg-dark hover:border-torg-blue hover:text-torg-blue";
  const parar = (e) => e.stopPropagation();
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={`${base}?formato=pdf`} download onClick={parar} className={cls} title="Baixar a conferência em PDF">
        <FileText size={compacto ? 12 : 14} /> PDF
      </a>
      <a href={`${base}?formato=xlsx`} download onClick={parar} className={cls} title="Baixar a conferência em Excel">
        <FileSpreadsheet size={compacto ? 12 : 14} /> Excel
      </a>
    </span>
  );
}
