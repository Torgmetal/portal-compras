"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Search,
  Box,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { ETAPAS } from "@/lib/producao-operacional";
import AgendaFabrica from "./AgendaFabrica";
import ExecucaoPecas from "./ExecucaoPecas";
import {
  CargaPreparacao,
  QualidadeOP,
  ExpedicaoOP,
} from "./VisoesOperacionais";
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
const ABAS = {
  execucao: "Peças e execução",
  materiais: "Materiais e R",
  qualidade: "Inspeções",
  expedicao: "Romaneios",
};
const ALERTAS = {
  SEM_LISTA: "Lista de peças ausente",
  PRODUZINDO_SEM_LISTA: "Produção sem lista conciliada",
  SEM_DETALHE_CORTE: "Detalhamento de corte pendente",
  SEM_CRONOGRAMA: "Cronograma não localizado",
  NADA_LANCADO: "Ordens ainda não lançadas",
};
export default function ProducaoOperacional({ inicial = "carteira" }) {
  const [visao, setVisao] = useState(
      ["carga", "agenda"].includes(inicial) ? inicial : "carteira",
    ),
    [todas, setTodas] = useState(["qualidade", "expedicao"].includes(inicial)),
    [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState("TODAS");
  const [opId, setOpId] = useState(""),
    [setor, setSetor] = useState("CORTE"),
    [aba, setAba] = useState(ABAS[inicial] ? inicial : "execucao");
  const estado = useConsulta(
    visao === "carteira"
      ? `/api/pcp/producao?todas=${todas ? "1" : "0"}`
      : null,
  );
  const catalogo = useConsulta(
    visao === "carteira" && todas ? "/api/producao/ops" : null,
  );
  const carteira = estado.dados?.ops || [];
  const ops =
    todas && catalogo.dados
      ? [
          ...carteira,
          ...catalogo.dados.ops
            .filter((o) => !carteira.some((c) => c.opId === o.opId))
            .map((o) => ({ ...o, semBaseProducao: true, alertas: [] })),
        ]
      : carteira;
  const op = ops.find((o) => o.opId === opId);
  useEffect(() => {
    window.scrollTo?.(0, 0);
    const main = document.querySelector("main.ml-64");
    if (main) main.scrollTop = 0;
  }, [opId]);
  function abrir(o, s = "CORTE") {
    setOpId(o.opId);
    setSetor(s);
    setAba(ABAS[inicial] ? inicial : "execucao");
  }
  const filtradas = ops.filter(
    (o) =>
      `${o.opNumero} ${o.cliente} ${o.obra}`
        .toLowerCase()
        .includes(busca.toLowerCase()) &&
      (filtro === "TODAS" ||
        (filtro === "ATRASADAS" && o.atrasoDias > 0) ||
        (filtro === "PENDENCIAS" && o.alertas?.length)),
  );
  return (
    <div className="w-full min-w-0 max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-torg-blue">
            Fábrica · Torg
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-torg-dark mt-1">
            {op ? `OP ${op.opNumero}` : "Produção"}
          </h1>
          <p className="text-sm text-torg-gray mt-2">
            {op
              ? `${op.cliente} · ${op.obra || "Obra sem descrição"}`
              : "Da programação à entrega: acompanhe as OPs e trabalhe nas peças de cada etapa."}
          </p>
        </div>
        <Link
          className={`${botao} flex gap-2 items-center`}
          href="/producao/modelo"
        >
          <Box size={18} />
          Consultar modelo 3D
        </Link>
      </header>
      {!op && (
        <nav
          aria-label="Áreas de produção"
          className="flex gap-1 border-b border-gray-200 overflow-x-auto"
        >
          <button
            className={`min-h-12 shrink-0 px-4 text-sm font-semibold border-b-2 ${visao === "carteira" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray"}`}
            onClick={() => setVisao("carteira")}
          >
            Carteira de OPs
          </button>
          <button
            className={`min-h-12 shrink-0 px-4 text-sm font-semibold border-b-2 ${visao === "carga" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray"}`}
            onClick={() => {
              setVisao("carga");
              setOpId("");
            }}
          >
            Carga da preparação
          </button>
          <button
            className={`min-h-12 shrink-0 px-4 text-sm font-semibold border-b-2 ${visao === "agenda" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray"}`}
            onClick={() => {
              setVisao("agenda");
              setOpId("");
            }}
          >
            Programação
          </button>
        </nav>
      )}
      {visao === "agenda" ? (
        <AgendaFabrica />
      ) : visao === "carga" ? (
        <CargaPreparacao />
      ) : (
        <EstadoConsulta estado={estado}>
          {op ? (
            <>
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <button
                  className={`${botao} flex gap-2 items-center`}
                  onClick={() => setOpId("")}
                >
                  <ArrowLeft size={16} />
                  Todas as OPs
                </button>
                <label className="text-xs text-torg-gray min-w-0 w-full sm:w-auto">
                  Trocar OP
                  <select
                    className={`${campo} block mt-1 w-full sm:max-w-sm`}
                    aria-label="Trocar OP"
                    value={op.opId}
                    onChange={(e) => setOpId(e.target.value)}
                  >
                    {ops.map((o) => (
                      <option key={o.opId} value={o.opId}>
                        OP {o.opNumero} · {o.cliente}
                      </option>
                    ))}
                  </select>
                </label>
                <Atualizar
                  onClick={estado.recarregar}
                  disabled={estado.carregando}
                />
              </div>
              <details className="bg-white border rounded-xl p-4 sm:p-5">
                <summary className="min-h-7 cursor-pointer text-sm font-medium text-torg-dark">
                  Resumo por etapa · próximo prazo: {data(op.entrega)}
                </summary>
                <div className="flex flex-wrap justify-between gap-3 mt-4">
                  <p className="text-sm text-torg-gray">
                    Próximo prazo de etapa:{" "}
                    <strong
                      className={
                        op.atrasoDias > 0 ? "text-red-700" : "text-torg-dark"
                      }
                    >
                      {data(op.entrega)}
                      {op.atrasoDias > 0
                        ? ` · ${op.atrasoDias} dias de atraso`
                        : ""}
                    </strong>
                  </p>
                  <p className="text-xs text-torg-gray">
                    {op.semBaseProducao
                      ? "Sem base de fabricação nesta carteira"
                      : `${op.pecas?.total || 0} registros de marcas na base da OP`}
                  </p>
                </div>
                <div className="flex overflow-x-auto xl:grid xl:grid-cols-7 gap-2 mt-4 pb-1">
                  {Object.entries(ETAPAS).map(([v, l]) => {
                    const s = op.setores?.find((x) => x.setor === v);
                    return (
                      <button
                        key={v}
                        onClick={() => {
                          setSetor(v);
                          setAba("execucao");
                        }}
                        className={`text-left shrink-0 w-28 xl:w-auto p-3 rounded-lg border min-h-20 ${setor === v && aba === "execucao" ? "border-torg-blue bg-blue-50" : "border-gray-100 hover:bg-gray-50"}`}
                      >
                        <span className="block text-xs text-torg-gray">
                          {l}
                        </span>
                        <strong className="block text-lg mt-1">
                          {s ? fmt(s.pendenteUn) : "—"}
                        </strong>
                        <span className="text-[11px] text-torg-gray">
                          {s ? "un. pendentes na OP" : "Sem informação"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </details>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                role="tablist"
                aria-label="Consulta da OP"
              >
                {Object.entries(ABAS).map(([v, l]) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={aba === v}
                    className={`${botao} shrink-0 ${aba === v ? "!bg-torg-dark !text-white !border-torg-dark" : ""}`}
                    onClick={() => setAba(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div key={`${op.opId}-${aba}`}>
                {(aba === "execucao" || aba === "materiais") && (
                  <ExecucaoPecas
                    key={`${op.opId}-${aba}-${setor}`}
                    op={op}
                    setor={setor}
                    setSetor={setSetor}
                    materiais={aba === "materiais"}
                    somenteLeitura={
                      op.semBaseProducao ||
                      ["ENCERRADA", "CANCELADA"].includes(op.status)
                    }
                  />
                )}
                {aba === "qualidade" && <QualidadeOP op={op} />}
                {aba === "expedicao" && <ExpedicaoOP op={op} />}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <label className="flex gap-2 items-center border rounded-lg px-3 bg-white flex-1 min-w-0">
                  <Search size={18} />
                  <input
                    aria-label="Buscar OP, cliente ou obra"
                    className="min-h-11 w-full min-w-0 outline-none text-sm"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar OP, cliente ou obra…"
                  />
                </label>
                <select
                  aria-label="Filtrar OPs"
                  className={campo}
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                >
                  <option value="TODAS">Todas as situações</option>
                  <option value="ATRASADAS">Prazo de etapa vencido</option>
                  <option value="PENDENCIAS">Com alertas de cadastro</option>
                </select>
                <select
                  aria-label="Escopo das OPs"
                  className={campo}
                  value={todas ? "todas" : "liberadas"}
                  onChange={(e) => setTodas(e.target.value === "todas")}
                >
                  <option value="liberadas">Liberadas pelo Planejamento</option>
                  <option value="todas">
                    Todas as OPs cadastradas (inclui histórico)
                  </option>
                </select>
                <Atualizar
                  onClick={estado.recarregar}
                  disabled={estado.carregando}
                />
              </div>
              <EstadoConsulta estado={catalogo}>{null}</EstadoConsulta>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-torg-gray">
                <p>
                  {filtradas.length} OPs · ordem definida pela programação do
                  Planejamento
                </p>
                <p>
                  Consulta:{" "}
                  {estado.dados?.geradoEm
                    ? new Date(estado.dados.geradoEm).toLocaleString("pt-BR")
                    : "data não informada"}
                </p>
              </div>
              <div className="space-y-4">
                {filtradas.map((o) => (
                  <article
                    key={o.opId}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    <div className="grid lg:grid-cols-[minmax(180px,1fr)_minmax(150px,.7fr)_minmax(200px,1fr)] gap-4 p-5">
                      <div>
                        <button
                          onClick={() => abrir(o)}
                          className="text-xl font-bold text-torg-blue min-h-11 flex items-center gap-2"
                        >
                          OP {o.opNumero}
                          <ArrowUpRight size={18} />
                        </button>
                        <p className="font-medium text-torg-dark">
                          {o.cliente}
                        </p>
                        <p className="text-sm text-torg-gray mt-1">
                          {o.obra || "Obra não informada"}
                        </p>
                        {o.semBaseProducao && (
                          <p className="text-xs mt-2 text-torg-gray">
                            {o.status} · Consulta histórica; sem fila de
                            fabricação
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-torg-gray">
                          Próximo prazo de etapa
                        </p>
                        <p
                          className={`text-lg font-semibold mt-2 ${o.atrasoDias > 0 ? "text-red-700" : "text-torg-dark"}`}
                        >
                          {data(o.entrega)}
                        </p>
                        <p className="text-xs text-torg-gray mt-1">
                          {o.atrasoDias > 0
                            ? `${o.atrasoDias} dias de atraso`
                            : "Conforme cronograma disponível"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-torg-gray">
                          Antes de executar
                        </p>
                        {o.alertas?.length ? (
                          <div className="mt-2 text-sm text-amber-900 space-y-1">
                            {o.alertas.map((a, i) => (
                              <p key={i} className="flex gap-2">
                                <AlertTriangle
                                  size={15}
                                  className="shrink-0 mt-0.5"
                                />
                                {ALERTAS[typeof a === "string" ? a : a.tipo] ||
                                  a.label ||
                                  a.mensagem ||
                                  String(a)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm mt-2 text-torg-dark">
                            Abra a etapa para conferir peças, programação e
                            material.
                          </p>
                        )}
                        <p className="text-xs text-torg-gray mt-2">
                          Material:{" "}
                          {o.compra?.label ||
                            o.compra?.status?.replaceAll("_", " ") ||
                            "sem informação de recebimento"}
                        </p>
                      </div>
                    </div>
                    <div className="border-t bg-gray-50/60 p-3 sm:p-4">
                      <div className="flex overflow-x-auto xl:grid xl:grid-cols-7 gap-2 pb-1">
                        {Object.entries(ETAPAS).map(([v, l]) => {
                          const s = o.setores?.find((x) => x.setor === v);
                          return (
                            <button
                              key={v}
                              onClick={() => abrir(o, v)}
                              className="text-left shrink-0 w-28 xl:w-auto min-h-20 p-3 rounded-lg bg-white border border-gray-100 hover:border-torg-blue"
                            >
                              <span className="text-xs text-torg-gray flex justify-between gap-1">
                                {l}
                                <ChevronRight size={13} />
                              </span>
                              <strong className="block text-lg text-torg-dark mt-1">
                                {s ? fmt(s.pendenteUn) : "—"}
                              </strong>
                              <span className="text-[11px] text-torg-gray">
                                {s ? "un. pendentes" : "Sem informação"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-torg-gray mt-3">
                        Saldo por etapa na OP. Abra para consultar o lote
                        liberado; o escopo pode ser menor. Uma peça pode ter
                        saldo em mais de uma etapa.
                      </p>
                    </div>
                  </article>
                ))}
              </div>
              {!filtradas.length && (
                <Vazio>
                  Nenhuma OP nesta seleção. Altere a busca ou o escopo das OPs.
                </Vazio>
              )}
            </>
          )}
        </EstadoConsulta>
      )}
    </div>
  );
}
