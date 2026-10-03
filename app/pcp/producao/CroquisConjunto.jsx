"use client";
// ─── OS CROQUIS DE UM CONJUNTO: O CHIP E A LISTA DO QUE FALTA ────────────────
//
// Matheus (03/10/2026): "onde mostra a coluna CROQUIS e tem 0/6 falta é interessante poder clicar em
// cima e ver quais são essas 6 que faltam e suas quantidades". A lista existia só no `title` do chip,
// e quem olha esta tela no pátio é o gerente de setor, no CELULAR — onde não há "passar o mouse".
// Agora o chip é um botão e a lista abre logo abaixo da linha (o mesmo desenho do Despacho).
import { ChevronDown, ChevronRight } from "lucide-react";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function CroquisChip({ peca: p, aberto, onAlternar }) {
  if (!p?.totalCroquis) return <span className="text-torg-gray-light">—</span>;
  const faltam = p.faltamCroquis?.length || 0;
  const texto = `${p.totalCroquis - faltam}/${p.totalCroquis}${p.prontoMontar ? " pronto" : ` · faltam ${faltam}`}`;
  if (p.prontoMontar || !faltam) {
    return (
      <span title={`Os ${p.totalCroquis} croquis deste conjunto estão cortados — pode descer.`}
        className="text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-200">
        {texto}
      </span>
    );
  }
  return (
    <button type="button" onClick={onAlternar} aria-expanded={aberto}
      title="Ver quais croquis faltam cortar"
      className="text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 border-amber-200 hover:brightness-95">
      {texto}
      {aberto ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
    </button>
  );
}

export function CroquisFaltando({ faltam = [] }) {
  // ⚠ NO CELULAR A TABELA ROLA DE LADO, E A LISTA NÃO PODE IR JUNTO. Ela ocupa a linha inteira (900 px)
  // e o chip que a abre fica à direita: rolada até ele, a marca e o perfil ficavam fora da tela e só
  // "faltam 195 de 246" aparecia (medido em 390 px, 03/10/2026). `sticky` a prende à borda esquerda
  // visível, com a largura da tela; do `md` para cima a tabela não rola e ela volta ao normal.
  return (
    <div className="text-[11px] max-w-2xl sticky left-2 w-[calc(100vw-5rem)] md:static md:w-auto">
      <div className="text-amber-700 font-semibold mb-1">Faltam cortar ({faltam.length}):</div>
      <div className="space-y-0.5">
        {faltam.map((c, i) => (
          <div key={`${c.marca}-${i}`} className="flex items-baseline gap-1.5">
            <span className="font-mono font-semibold text-torg-dark shrink-0">{c.marca}</span>
            {c.descricao && <span className="text-torg-gray truncate">· {c.descricao}</span>}
            <span className="text-amber-700 font-semibold tabular-nums shrink-0 ml-auto">
              faltam {fmtN(c.faltaQtd)}{c.qtd ? ` de ${fmtN(c.qtd)}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
