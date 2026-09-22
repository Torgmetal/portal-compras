"use client";

import { useState } from "react";
import { CheckCircle2, ArrowRightLeft } from "lucide-react";

// ⚠⚠ AS DUAS LISTAS LADO A LADO, SEM BLOQUEAR NADA. O PCP diz o que PODE ser produzido naquela
// máquina; o programador diz o que VAI ser cortado. Elas deveriam ser a mesma lista — quando não
// são, alguém tem trabalho parado ou material saindo da chapa sem liberação.
//
// A fábrica não pode parar porque duas telas discordam: o nesting já foi feito e a chapa já está na
// máquina. Isto INFORMA; quem decide é quem está lá.

const Grupo = ({ cor, titulo, itens, texto }) => (
  <div className={`mt-3 rounded-xl border px-4 py-3 ${cor}`}>
    <p className="text-sm font-bold">{titulo}</p>
    <p className="mt-1 text-xs leading-relaxed">{itens.map(texto).join("   ·   ")}</p>
  </div>
);

export default function ConferirGantt({ planoId, recursos }) {
  const [codigo, setCodigo] = useState("");
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const conferir = async (escolhido) => {
    setCodigo(escolhido);
    setDados(null);
    setErro(null);
    if (!escolhido) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/mes-lab/nesting/${planoId}/gantt?recurso=${encodeURIComponent(escolhido)}`);
      const json = await r.json();
      if (!json.success) throw new Error(json.error);
      setDados(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const c = dados?.conferencia;
  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ArrowRightLeft size={16} className="text-torg-blue" />
        <span className="text-sm font-bold">Bater com o Gantt</span>
        <select
          value={codigo}
          onChange={(e) => conferir(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold"
        >
          <option value="">Em qual máquina?</option>
          {recursos.map((r) => <option key={r.codigo} value={r.codigo}>{r.nome}</option>)}
        </select>
        {ocupado ? <span className="text-xs text-torg-gray">conferindo…</span> : null}
        {erro ? <span className="text-xs font-semibold text-red-600">{erro}</span> : null}
      </div>

      {c ? <Resultado c={c} dados={dados} /> : null}
    </div>
  );
}

function Resultado({ c, dados }) {
  return (
    <>
          {/* ⚠⚠ "COMPATÍVEL COM O SETOR" NÃO É "CONFIRMADO PARA ESTA MÁQUINA" (achado do Codex).
              Quando o PCP programa em balde, a liberação é do setor — dizer que a marca está
              liberada "para o Laser Chapa" seria dar um aval que o Gantt não deu. */}
          {dados.doSetor ? (
            <p className="mt-3 rounded-lg bg-torg-blue-50 px-3 py-2 text-xs font-semibold text-torg-blue-700">
              O PCP programa o setor {dados.recurso.setor}, não cada máquina: o que aparece abaixo é
              <strong> compatível com o setor</strong>, não confirmado para esta máquina.
            </p>
          ) : null}

          {c.resumo.bate ? (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              <CheckCircle2 size={16} />
              Tudo o que este plano corta está liberado: {c.resumo.liberadas} marcas.
            </p>
          ) : null}

          {c.semLiberacao.length ? (
            <Grupo
              cor="border-red-200 bg-red-50 text-red-900"
              titulo={`${c.semLiberacao.length} marca(s) no plano que o PCP não liberou para esta máquina`}
              itens={c.semLiberacao}
              texto={(x) => `${x.qtd}× ${x.marca} (obra ${x.opNumero || "—"})`}
            />
          ) : null}

          {c.semObra.length ? (
            <Grupo
              cor="border-red-200 bg-red-50 text-red-900"
              titulo={`${c.semObra.length} peça(s) do plano sem obra — não dá para conferir`}
              itens={c.semObra}
              texto={(x) => `${x.qtd}× ${x.marca} (barra ${x.unidade})`}
            />
          ) : null}

          {/* ⚠ Cortar mais do que o SALDO liberado é legítimo (aproveitamento de chapa), mas o
              excedente não tem para onde ir na obra, e quem confere precisa ver. */}
          {c.resumo.aMais ? (
            <Grupo
              cor="border-amber-200 bg-amber-50 text-amber-900"
              titulo={`${c.resumo.aMais} marca(s) com mais peças no plano do que ainda falta produzir`}
              itens={c.liberadas.filter((x) => x.aMais > 0)}
              texto={(x) => `${x.marca}: plano ${x.qtd}, falta ${x.saldo} de ${x.qte}`}
            />
          ) : null}

          {c.liberadas.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold text-torg-gray">
                {c.liberadas.length} marca(s) liberada(s) e no plano
              </summary>
              <p className="mt-1.5 text-xs text-torg-gray">
                {c.liberadas.map((x) => `${x.qtd}× ${x.marca}`).join("   ·   ")}
              </p>
            </details>
          ) : null}

          {/* ⚠⚠ A FILA NÃO É DIVERGÊNCIA, e por isso fica recolhida e fora do veredito: a fila da
              máquina é o backlog inteiro (432 marcas no Laser Chapa, medido), e nada obriga este
              plano a cobri-la. */}
          {c.naFila.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-bold text-torg-gray-light">
                {c.naFila.length} marca(s) na fila desta máquina, fora deste plano — não é divergência
              </summary>
              <p className="mt-1.5 text-xs text-torg-gray-light">
                {c.naFila.slice(0, 40).map((x) => `${x.saldo}× ${x.marca}`).join("   ·   ")}
                {c.naFila.length > 40 ? `   …e mais ${c.naFila.length - 40}` : ""}
              </p>
            </details>
          ) : null}
    </>
  );
}
