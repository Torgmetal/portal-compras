"use client";
import { useState } from "react";
import Link from "next/link";
import { ETAPAS } from "@/lib/producao-operacional";
import {
  useConsulta,
  EstadoConsulta,
  Vazio,
  Atualizar,
  botao,
  campo,
  fmt,
  data,
} from "./ConsultaOperacional";
const FERRAMENTAS = [
  ["/producao/planejamento-semanal", "Editar programação semanal"],
  ["/producao/catalogo", "Importar e administrar peças"],
  ["/producao/programacao/fila-corte", "Fila de corte"],
  ["/producao/programacao/montagem", "Bancadas de montagem"],
  ["/producao/programacao/solda", "Bancadas de solda"],
  ["/producao/programacao/acabamento", "Acabamento"],
  ["/producao/programacao/jato", "Jato"],
  ["/producao/programacao/pintura", "Pintura"],
  ["/producao/programacao/expedicao", "Preparação da expedição"],
  ["/producao/prioridades", "Prioridades"],
  ["/producao/consulta-estoque", "Solicitações de estoque"],
  ["/producao/mes", "Consulta MES"],
  ["/producao/indicadores", "Resultados e metas"],
];
export default function AgendaFabrica() {
  const estado = useConsulta("/api/pcp/gantt");
  const [verSolicitacoes, setVerSolicitacoes] = useState(false);
  const solicitacoes = useConsulta(
    verSolicitacoes ? "/api/planejamento/solicitacao-producao" : null,
  );
  const [setor, setSetor] = useState("TODOS"),
    [dia, setDia] = useState(""),
    [busca, setBusca] = useState(""),
    [somenteSaldo, setSomenteSaldo] = useState(true);
  const lotes = (estado.dados?.lotes || [])
    .filter(
      (l) =>
        (setor === "TODOS" || l.setor === setor) &&
        (!dia || l.dia === dia) &&
        (!somenteSaldo || l.pecas > l.feitas) &&
        `${l.op} ${l.obra || ""} ${l.recurso || ""} ${(l.itens || []).map((i) => i.m).join(" ")}`
          .toLowerCase()
          .includes(busca.toLowerCase()),
    )
    .sort(
      (a, b) =>
        String(a.dia).localeCompare(String(b.dia)) ||
        String(a.recurso).localeCompare(String(b.recurso)),
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-torg-dark">
            Programação da fábrica
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Lotes por dia, recurso e etapa. A programação organiza o trabalho; o
            apontamento confirma a execução.
          </p>
        </div>
        <Atualizar onClick={estado.recarregar} disabled={estado.carregando} />
      </div>
      <details className="bg-white border rounded-xl p-4">
        <summary className="text-torg-blue font-medium cursor-pointer min-h-11 py-2">
          Organizar filas, bancadas e recursos
        </summary>
        <p className="text-sm text-torg-gray my-2">
          Ferramentas de programação e movimentação dos setores.
        </p>
        <div className="flex flex-wrap gap-2">
          {FERRAMENTAS.map(([href, label]) => (
            <Link key={href} href={href} className={botao}>
              {label}
            </Link>
          ))}
        </div>
      </details>
      <details
        className="bg-white border rounded-xl p-4"
        onToggle={(e) => setVerSolicitacoes(e.currentTarget.open)}
      >
        <summary className="text-torg-blue font-medium cursor-pointer min-h-11 py-2">
          Solicitações e datas necessárias do Planejamento
        </summary>
        <EstadoConsulta estado={solicitacoes}>
          <div className="grid lg:grid-cols-2 gap-3 mt-3">
            {solicitacoes.dados?.solicitacoes
              .filter((s) => s.status !== "CONCLUIDA")
              .map((s) => (
                <article key={s.id} className="border rounded-lg p-4 text-sm">
                  <h3 className="font-semibold">
                    OP {s.opNumero} · {s.cliente}
                  </h3>
                  <p className="text-torg-gray mt-1">
                    Entrega solicitada: {data(s.dataEntrega)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {Object.entries(s.datasSetor || {}).map(([etapa, d]) => (
                      <p key={etapa}>
                        {ETAPAS[etapa] || etapa}: <strong>{data(d)}</strong>
                      </p>
                    ))}
                  </div>
                </article>
              ))}
          </div>
          {solicitacoes.dados &&
            !solicitacoes.dados.solicitacoes.some(
              (s) => s.status !== "CONCLUIDA",
            ) && <Vazio>Nenhuma solicitação pendente.</Vazio>}
        </EstadoConsulta>
      </details>
      <div className="flex flex-wrap gap-3">
        <input
          className={`${campo} flex-1`}
          aria-label="Buscar na programação"
          placeholder="OP, marca, obra ou recurso…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          className={campo}
          aria-label="Etapa da programação"
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
        >
          <option value="TODOS">Todas as etapas</option>
          {Object.entries(ETAPAS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Dia da programação"
          className={campo}
          value={dia}
          onChange={(e) => setDia(e.target.value)}
        />
        <label className="min-h-11 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={somenteSaldo}
            onChange={(e) => setSomenteSaldo(e.target.checked)}
          />
          Somente com saldo
        </label>
      </div>
      <EstadoConsulta estado={estado}>
        <p className="text-xs text-torg-gray">
          {lotes.length} lotes na seleção ·{" "}
          {estado.dados?.foraDoQuadro?.length || 0} registros fora do quadro do
          PCP
        </p>
        <div className="grid xl:grid-cols-2 gap-4">
          {lotes.map((l) => (
            <article
              key={l.id}
              className="bg-white rounded-xl border p-5 space-y-3"
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-bold text-torg-dark">
                  OP {l.op} · {ETAPAS[l.setor] || l.setor}
                </h3>
                <span className="text-sm">
                  {l.fila ? "A programar" : data(l.dia)}
                </span>
              </div>
              <p className="text-sm text-torg-gray">
                {l.recurso || "Sem recurso definido"} ·{" "}
                {l.obra || "Obra sem descrição"}
              </p>
              {l.veioDe && (
                <p className="text-sm text-amber-900">
                  Saldo trazido de {data(l.veioDe)}
                </p>
              )}
              {l.desde && (
                <p className="text-sm text-amber-900">
                  Aguardando desde {data(l.desde)}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-sm">
                <span>
                  Total <strong className="block">{fmt(l.pecas)} un.</strong>
                </span>
                <span>
                  Concluídas{" "}
                  <strong className="block">{fmt(l.feitas)} un.</strong>
                </span>
                <span>
                  Saldo{" "}
                  <strong className="block text-torg-blue">
                    {fmt(Math.max(0, l.pecas - l.feitas))} un.
                  </strong>
                </span>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-torg-blue min-h-11 py-2">
                  Conferir peças do lote
                </summary>
                <div className="divide-y">
                  {l.itens?.map((i, n) => (
                    <div
                      key={`${i.id}-${n}`}
                      className="py-2 text-sm flex justify-between gap-3"
                    >
                      <span className="break-all">{i.m}</span>
                      <span className="shrink-0">
                        {fmt(i.f)} / {fmt(i.q)} un.
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))}
        </div>
        {!lotes.length && <Vazio>Nenhum lote nesta seleção.</Vazio>}
      </EstadoConsulta>
    </div>
  );
}
