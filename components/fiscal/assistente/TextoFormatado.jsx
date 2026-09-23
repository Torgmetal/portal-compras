"use client";

// ─── MARKDOWN MÍNIMO, SEM INJEÇÃO DE HTML ────────────────────────────────────
//
// ⚠⚠ NADA DE `dangerouslySetInnerHTML`, E NADA DE BIBLIOTECA NOVA. O texto aqui vem de um modelo de
// linguagem que, por desenho, pode receber conteúdo de documento de terceiro — é exatamente a
// superfície em que injeção de HTML vira problema de verdade. Este renderizador constrói NÓS REACT:
// o que não for um dos formatos abaixo sai como texto literal, que é o comportamento seguro.
//
// ⚠ Cobre o que o assistente realmente usa: parágrafo, lista, negrito, itálico e código em linha.
// Tabela e bloco de código ficaram de fora de propósito — o dado tabular vai nos BLOCOS fiscais,
// renderizados pelo servidor, que é onde ele tem lastro.

const EMFASE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function comEnfase(texto, chave) {
  return String(texto).split(EMFASE).filter(Boolean).map((p, i) => {
    const k = `${chave}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={k} className="font-semibold text-torg-dark">{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={k}>{p.slice(1, -1)}</em>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={k} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-torg-dark">{p.slice(1, -1)}</code>;
    return <span key={k}>{p}</span>;
  });
}

export default function TextoFormatado({ texto }) {
  const linhas = String(texto ?? "").split("\n");
  const saida = [];
  let lista = null;

  const fecharLista = () => {
    if (lista) {
      saida.push(<ul key={`l${saida.length}`} className="my-2 list-disc space-y-1 pl-5">{lista}</ul>);
      lista = null;
    }
  };

  linhas.forEach((cru, i) => {
    const l = cru.trimEnd();
    const item = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (item) {
      lista ??= [];
      lista.push(<li key={`i${i}`} className="text-sm leading-relaxed text-torg-gray">{comEnfase(item[1], `i${i}`)}</li>);
      return;
    }
    fecharLista();
    if (!l.trim()) return;
    const titulo = l.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      saida.push(<p key={`t${i}`} className="mt-3 text-sm font-semibold text-torg-dark">{comEnfase(titulo[2], `t${i}`)}</p>);
      return;
    }
    saida.push(<p key={`p${i}`} className="my-1.5 text-sm leading-relaxed text-torg-gray">{comEnfase(l, `p${i}`)}</p>);
  });
  fecharLista();
  return <div>{saida}</div>;
}
