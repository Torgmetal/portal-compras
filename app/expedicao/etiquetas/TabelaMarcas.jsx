"use client";
import { Check } from "lucide-react";
import { ThFiltro } from "@/components/FiltroColuna";

// A TABELA DE MARCAS — o que vai ser impresso.
//
// ⚠ Em arquivo próprio: é o bloco de UI mais denso da tela (funis, histórico de impressão,
// seleção) e era o que mantinha o `EtiquetasClient` encostado no teto de 350 linhas.

const quando = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(+d)
    ? null
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const nkg = (n) =>
  Number(n) > 0 ? Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

function Impressa({ peca }) {
  const em = quando(peca.impressaEm);
  if (!em) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700 whitespace-nowrap">
      <Check size={13} className="shrink-0" />
      {em}
      {peca.impressoes > 1 && <b className="text-torg-gray">×{peca.impressoes}</b>}
    </span>
  );
}

// Os funis do cabeçalho. Matheus (08/09/2026): "no cabeçalho coloque os filtros igual fizemos
// anteriormente tipo excel" — é o `components/FiltroColuna`, o mesmo das Listas de Expedição e da
// consulta do Comercial, e não mais um filtro inventado só para esta tela.
//
// ⚠ Peças e Peso ficam SEM funil de propósito: são números contínuos, e uma lista de 200 valores
// distintos não é filtro, é ruído. Para eles vale a busca por texto que já está na barra.
export const COLUNAS_ETIQUETA = [
  { key: "marca", label: "Marca", valor: (p) => p.marca || "—" },
  { key: "descricao", label: "Descrição", valor: (p) => p.descricao || "—" },
  // ⚠ O QUE FILTRA É "JÁ SAIU OU NÃO", não a data. Filtrar por "08/09 14:20" separaria duas
  // impressões do mesmo lote; quem abre este funil quer as que faltam imprimir.
  { key: "impressa", label: "Etiqueta", valor: (p) => (p.impressaEm ? "Já impressa" : "Não impressa") },
];

export default function TabelaMarcas({ visiveis, sel, alterna, busca, fp }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ minWidth: 640 }}>
        <thead className="bg-gray-50/60 text-[11px] uppercase text-torg-gray">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <ThFiltro col="marca" label="Marca" className="text-left px-2 py-2" {...fp} />
            <ThFiltro col="descricao" label="Descrição" className="text-left px-2 py-2" {...fp} />
            <th className="text-right px-2 py-2">Peças</th>
            <th className="text-right px-2 py-2">Peso unit. (kg)</th>
            <ThFiltro col="impressa" label="Etiqueta" className="text-left px-4 py-2" {...fp} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {visiveis.map((p) => (
            <tr key={p.id} onClick={() => alterna(p.marca)}
              className={`cursor-pointer ${sel.has(p.marca) ? "bg-torg-blue-50/50" : "hover:bg-gray-50/60"}`}>
              <td className="px-3 py-2">
                <input type="checkbox" readOnly checked={sel.has(p.marca)} className="pointer-events-none" />
              </td>
              <td className="px-2 py-2 font-bold text-torg-dark">{p.marca}</td>
              <td className="px-2 py-2 text-torg-gray">{p.descricao || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums">{Math.max(1, p.qte || 1)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{nkg(p.pesoUnitKg)}</td>
              <td className="px-4 py-2"><Impressa peca={p} /></td>
            </tr>
          ))}
          {!visiveis.length && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-torg-gray">
              {busca
                ? <>Nenhuma marca bate com &quot;{busca}&quot;.</>
                : "Nenhuma marca passa pelos filtros do cabeçalho."}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
