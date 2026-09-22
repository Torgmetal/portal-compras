"use client";

import { TriangleAlert, CircleAlert } from "lucide-react";

// ⚠⚠ A PRÉVIA MOSTRA O QUE VAI SER GRAVADO, NÃO UM RESUMO BONITO. A lição está no CLAUDE.md: a aba
// "Revisão" do import de listas dizia "18 incluídas" e nenhuma entrou, porque o número era uma
// PREVISÃO apresentada como recibo. Aqui, o que aparece na tela é literalmente o que a gravação
// escreve — e as divergências vêm ANTES do botão, não escondidas num canto.

const Bloco = ({ cor, icone: Icone, titulo, itens }) => (
  <div className={`mt-4 rounded-xl border px-4 py-3 ${cor}`}>
    <p className="flex items-center gap-2 text-sm font-bold">
      <Icone size={15} /> {titulo}
    </p>
    <ul className="mt-1.5 space-y-1 text-sm">
      {itens.map((t) => <li key={t}>· {t}</li>)}
    </ul>
  </div>
);

export default function Previa({ previa }) {
  const { unidades = [], pendentes = [], divergencias = [] } = previa;
  const pecas = unidades.reduce((a, u) => a + u.itens.reduce((s, i) => s + i.qtd, 0), 0);

  return (
    <div className="mt-5 border-t border-gray-100 pt-5">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h3 className="text-lg font-extrabold">{previa.nome}</h3>
        <span className="text-sm text-torg-gray">
          {previa.programa} · {previa.descricao}
        </span>
      </div>
      <p className="mt-1 text-sm text-torg-gray">
        obra <strong className="text-torg-dark">{previa.opNumero || "—"}</strong> ·{" "}
        {unidades.length} {previa.unidades?.[0]?.tipo === "CHAPA" ? "chapa(s)" : "barra(s)"} ·{" "}
        {previa.marcas} marcas · {pecas} peças
      </p>

      {divergencias.length ? (
        <Bloco
          cor="border-amber-200 bg-amber-50 text-amber-900"
          icone={TriangleAlert}
          titulo="O relatório e o arquivo da máquina não batem em tudo"
          itens={divergencias}
        />
      ) : null}

      {pendentes.length ? (
        <Bloco
          cor="border-red-200 bg-red-50 text-red-900"
          icone={CircleAlert}
          titulo={`${pendentes.length} marca(s) sem peça no portal — entram como pendência`}
          itens={pendentes.map((p) => `${p.marca}: ${p.motivo}`)}
        />
      ) : null}

      <div className="mt-4 space-y-3">
        {unidades.map((u) => (
          <div key={u.indice} className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
            <p className="text-sm font-bold">
              {u.tipo === "CHAPA" ? "Chapa" : "Barra"} {u.indice}
              <span className="ml-2 font-semibold text-torg-gray">
                {u.pecas} peças
                {u.sobraMm != null ? ` · sobra ${u.sobraMm} mm` : ""}
                {u.aproveitamento != null ? ` · ${u.aproveitamento}%` : ""}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {u.itens.map((i) => (
                <span
                  key={`${u.indice}-${i.marca}`}
                  className={`rounded-lg px-2 py-1 text-xs font-bold ${
                    i.pecaConjuntoId ? "bg-white text-torg-dark" : "bg-red-100 text-red-800"
                  }`}
                  /* ⚠ Peça DEDUZIDA é peça sem gravação, nomeada por cruzamento (§12.8.2) — vai
                     marcada porque é peça para conferir no olho. */
                  title={i.deduzida ? "Nome deduzido do relatório: esta peça não tem gravação" : undefined}
                >
                  {i.qtd}× {i.marca}{i.deduzida ? " ·dz" : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
