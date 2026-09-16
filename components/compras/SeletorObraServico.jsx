"use client";
import { useRouter } from "next/navigation";
import { fmtOP } from "@/lib/utils";

// O seletor de obra das telas de Aluguel e Medição de Montagem.
//
// ⚠⚠ A OBRA VAI NA URL, e o filtro acontece NO BANCO. Escrito assim desde o começo por causa do que
// aconteceu nas RMs de material em 16/09/2026: lá o filtro era `rms.filter()` sobre uma lista que o
// servidor já tinha cortado nas 100 mais recentes, e 111 RMs ficaram invisíveis por semanas.
//
// ⚠ É client component só por causa do `onChange`. Todo o resto da tela continua no servidor.

/**
 * @param {{numero:string, cliente:string, quantidade:number}[]} obras  do SERVIDOR, não das linhas
 * @param {string} base  "/compras/aluguel" ou "/compras/montagem"
 */
export default function SeletorObraServico({ obras, opSelecionada, verArquivadas, base, truncada, total, limite }) {
  const router = useRouter();

  const irPara = (op) => {
    const q = new URLSearchParams();
    if (verArquivadas) q.set("arquivadas", "1");
    if (op) q.set("op", op);
    const s = q.toString();
    router.push(s ? `${base}?${s}` : base);
  };

  // ⚠⚠ SÓ SOME QUANDO NÃO HÁ NADA A DIZER. Com `obras.length === 0` sozinho, a aba Histórico de uma
  // obra sem RM escondia o seletor E o "Limpar filtro" juntos: a pessoa ficava presa num filtro sem
  // ter como tirá-lo pela tela. Enquanto houver obra escolhida, a saída fica à vista.
  if (obras.length === 0 && !truncada && !opSelecionada) return null;

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {obras.length > 0 && (
        <select
          value={opSelecionada || ""}
          onChange={(e) => irPara(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white text-torg-dark font-medium"
          title="Filtrar RMs por OP"
        >
          <option value="">Todas as OPs</option>
          {obras.map((o) => (
            <option key={o.numero} value={o.numero}>
              {fmtOP(o.numero)}{o.cliente ? ` — ${o.cliente}` : ""} ({o.quantidade})
            </option>
          ))}
        </select>
      )}
      {opSelecionada && (
        <button onClick={() => irPara("")} className="text-torg-blue font-medium hover:underline">
          Limpar filtro
        </button>
      )}
      {/* ⚠⚠ O CORTE APARECE. Sem obra escolhida a consulta ainda para no teto — e o valor somado
          abaixo é só do que foi carregado. Número de dinheiro parcial sem aviso é pior que lista
          curta: ninguém desconfia de um total. */}
      {truncada && !opSelecionada && (
        <span className="text-torg-orange font-medium">
          mostrando as {limite} mais recentes de {total} — escolha uma OP para ver a obra inteira
        </span>
      )}
    </div>
  );
}
