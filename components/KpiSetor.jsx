"use client";
// ─── CARTÃO DE NÚMERO DAS ESTEIRAS (Corte · Montagem · Solda) ─────────────────
// Vitor (01/09/2026): "mude a visualização da aba de corte e montagem, deixa parecida com a de
// solda, ficou mais clean".
//
// ⚠⚠ O QUE DEIXAVA AS OUTRAS DUAS PESADAS não era o tamanho do cartão, era a COR DE FUNDO. A
// montagem tinha cinco blocos, cada um com o seu tom (laranja, verde, azul, âmbar, cinza) e o
// número em 2xl — cinco coisas gritando ao mesmo tempo, e nenhuma se destacando. Aqui o fundo é
// branco em todos; a cor fica só no quadradinho do ícone, que é pequeno o bastante para identificar
// sem competir. O número desce de 2xl para lg porque quem lê a esteira lê a LISTA; o cartão é
// contexto, não o assunto.
//
// ⚠ SELECIONÁVEL SEM MUDAR DE FORMA: quando o cartão filtra a lista (montagem e corte), o estado
// ligado é um anel, não uma troca de fundo. Cartão que muda de cor ao ser clicado faz a pessoa
// procurar o que mudou na tela inteira.
export default function KpiSetor({ icon: Icon, cor = "bg-torg-blue", label, valor, sub, alerta, onClick, ativo }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { onClick, type: "button" } : {})}
      className={`bg-white rounded-xl shadow-sm border p-3.5 flex items-center gap-3 w-full text-left transition-all ${
        ativo ? "border-torg-blue ring-2 ring-torg-blue/25" : "border-gray-100"
      } ${onClick ? "hover:border-gray-200" : ""}`}>
      <div className={`${cor} p-2 rounded-lg shrink-0`}>{Icon ? <Icon size={18} className="text-white" /> : null}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-torg-gray uppercase tracking-wider truncate">{label}</p>
        <p className="text-lg font-extrabold text-torg-dark leading-tight tabular-nums">{valor}</p>
        <p className={`text-[10px] truncate ${alerta ? "text-amber-700 font-semibold" : "text-torg-gray"}`}>{sub}</p>
      </div>
    </Tag>
  );
}

/**
 * Cabeçalho das esteiras: título com ícone e uma linha dizendo o que a tela é.
 * ⚠ A LINHA DE BAIXO NÃO É ENFEITE. A esteira e a aba do setor dentro da OP mostram as mesmas
 * peças de formas diferentes; sem uma frase dizendo qual é qual, a pessoa não sabe em qual das duas
 * está — foi exatamente a dúvida do Vitor ao ver a tela da solda.
 */
export function CabecalhoSetor({ icon: Icon, titulo, children }) {
  return (
    <div>
      <h1 className="text-xl font-extrabold text-torg-dark flex items-center gap-2">
        {Icon ? <Icon size={20} className="text-torg-blue" /> : null} {titulo}
      </h1>
      <p className="text-xs text-torg-gray mt-1 max-w-3xl">{children}</p>
    </div>
  );
}
