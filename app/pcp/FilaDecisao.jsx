"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  Scissors,
} from "lucide-react";
import {
  ordenarDecisoesPcp,
  FILAS_DECISAO,
  pertenceFilaDecisao,
} from "@/lib/pcp-fila-decisao";
import s from "./fila-decisao.module.css";
const numero = (n) => Number(n || 0).toLocaleString("pt-BR");
export default function FilaDecisao({ ops, carregando = false }) {
  const [escolhida, setEscolhida] = useState("");
  const [setor, setSetor] = useState("CORTE");
  const [fila, setFila] = useState("LIBERAR");
  const [revisao, setRevisao] = useState(0);
  const [consulta, setConsulta] = useState(null);
  const [limite, setLimite] = useState(8);
  const op = ops?.find((o) => o.opId === escolhida) || ops?.[0];
  const chave = `${op?.opId || ""}:${setor}:${revisao}`;
  useEffect(() => {
    if (!op?.opId) return;
    const controller = new AbortController();
    setConsulta({ chave, loading: true });
    async function carregar() {
      try {
        const qs = new URLSearchParams({ opId: op.opId, setor, decisao: "1" });
        const res = await fetch(`/api/pcp/despacho?${qs}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const dados = await res.json();
        if (!res.ok || !dados.decisao)
          throw new Error(dados.error || "Não foi possível conferir a fila.");
        if (!controller.signal.aborted) setConsulta({ chave, dados });
      } catch (e) {
        if (!controller.signal.aborted) setConsulta({ chave, erro: e.message });
      }
    }
    carregar();
    return () => controller.abort();
  }, [op?.opId, setor, chave]);
  const dados = consulta?.chave === chave ? consulta.dados : null;
  const erro = consulta?.chave === chave ? consulta.erro : null;
  const loading = !!op && !dados && !erro;
  const pecas = useMemo(() => ordenarDecisoesPcp(dados?.pecas || []), [dados]);
  const grupos = Object.fromEntries(
    Object.keys(FILAS_DECISAO).map((k) => [
      k,
      pecas.filter((p) =>
        pertenceFilaDecisao(p, k, dados?.decisao.porId[p.id]),
      ),
    ]),
  );
  const linhas = grupos[fila];
  const href = (marca) =>
    `/pcp/producao?${new URLSearchParams({ opId: op.opId, setor, fila, ...(marca ? { marca } : {}) })}`;
  function mudarFila(valor) {
    setFila(valor);
    setLimite(8);
  }
  return (
    <section
      className={s.root}
      id="decisao-pcp"
      aria-labelledby="titulo-decisao"
    >
      <div className={s.header}>
        <div>
          <p className={s.eyebrow}>PRÓXIMA AÇÃO DO PCP</p>
          <h2 id="titulo-decisao">Da fila para a fábrica</h2>
          <p>
            Confira a OP, resolva as pendências e libere pelas ações que você já
            usa.
          </p>
        </div>
        <button
          className={s.refresh}
          onClick={() => setRevisao((v) => v + 1)}
          disabled={!op || loading}
        >
          <RefreshCw size={16} /> Atualizar conferências
        </button>
      </div>
      {carregando && !ops ? (
        <p className={s.empty}>
          <Loader2 className="animate-spin" size={18} /> Carregando OPs
          liberadas…
        </p>
      ) : !ops ? (
        <p className={s.empty} role="alert">
          Não foi possível consultar as OPs. Use Atualizar no início do painel.
        </p>
      ) : !op ? (
        <p className={s.empty}>
          <CheckCircle2 size={20} /> Nenhuma OP liberada pelo Planejamento.
        </p>
      ) : (
        <>
          <div className={s.controls}>
            <label>
              OP liberada
              <select
                value={op.opId}
                onChange={(e) => {
                  setEscolhida(e.target.value);
                  setLimite(8);
                }}
              >
                {ops.map((o) => (
                  <option key={o.opId} value={o.opId}>
                    OP {o.opNumero} · {o.obra || o.cliente || "Obra"}
                  </option>
                ))}
              </select>
            </label>
            <div className={s.sectors} aria-label="Setor da fila">
              {[
                ["CORTE", "Preparação / corte"],
                ["MONTAGEM", "Montagem"],
              ].map(([k, t]) => (
                <button
                  key={k}
                  aria-pressed={setor === k}
                  onClick={() => {
                    setSetor(k);
                    mudarFila("LIBERAR");
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {!!op.liberacoes?.length && (
            <p className={s.meta}>
              Planejamento:{" "}
              {[
                ...new Set(
                  op.liberacoes.map((l) => l.prioridade).filter(Boolean),
                ),
              ].join(" · ") || "sem prioridade informada"}
              . A ordem das OPs segue a programação do PCP.
            </p>
          )}
          <div className={s.tabs}>
            {Object.entries(FILAS_DECISAO)
              .filter(([k]) => setor === "CORTE" || k !== "DESTRAVA")
              .map(([k, t]) => (
                <button
                  key={k}
                  aria-pressed={fila === k}
                  onClick={() => mudarFila(k)}
                >
                  <span>{t}</span>
                  <b>{dados ? numero(grupos[k].length) : "—"}</b>
                  <small>marcas</small>
                </button>
              ))}
          </div>
          {loading ? (
            <p className={s.empty} role="status">
              <Loader2 className="animate-spin" size={20} /> Conferindo
              material, desenhos e programação…
            </p>
          ) : erro ? (
            <div className={s.error} role="alert">
              <CircleAlert size={20} />
              <p>{erro}</p>
              <button onClick={() => setRevisao((v) => v + 1)}>
                Tentar novamente
              </button>
            </div>
          ) : (
            dados && (
              <>
                <p className={s.meta}>Já concluídas: {numero(Object.values(dados.decisao.porId).filter(d => d.estado === 'CONCLUIDA').length)} marcas · Fora da fila de liberação: {numero(Object.values(dados.decisao.porId).filter(d => d.estado === 'FORA_DO_LOTE').length)} marcas.</p>
                {dados.liberacao?.ponteirosPerdidos > 0 && (
                  <p className={s.warning}>
                    Há {dados.liberacao.ponteirosPerdidos} referências do lote
                    que não foram encontradas na lista atual. Confira a
                    liberação com o Planejamento.
                  </p>
                )}
                {dados.decisao.incompleta && (
                  <p className={s.warning}>
                    Há conferências incompletas. As peças afetadas ficam em “O
                    que precisa de conferência”.
                  </p>
                )}
                <div className={s.listHeader}>
                  <div>
                    <h3>{FILAS_DECISAO[fila]}</h3>
                    <p>
                      {numero(linhas.length)} marcas ·{" "}
                      {numero(
                        linhas.reduce(
                          (n, p) => n + (dados.decisao.porId[p.id]?.saldo || 0),
                          0,
                        ),
                      )}{" "}
                      peças de saldo nesta OP
                    </p>
                  </div>
                  {!!linhas.length && (
                    <Link className={s.primary} href={href()}>
                      Abrir peças desta fila <ArrowUpRight size={16} />
                    </Link>
                  )}
                </div>
                {fila === "DESTRAVA" && (
                  <p className={s.meta}>
                    Estes cortes são necessários para os conjuntos indicados.
                    Outros croquis podem continuar pendentes. As prioridades já
                    definidas aparecem primeiro.
                  </p>
                )}
                {!linhas.length ? (
                  <p className={s.empty}>
                    {fila === "LIBERAR"
                      ? "Nenhuma peça com todas as conferências prontas para uma nova liberação. Confira as pendências ou o trabalho em execução."
                      : "Nenhuma marca neste recorte."}
                  </p>
                ) : (
                  <div className={s.list}>
                    {linhas.slice(0, limite).map((p) => {
                      const d = dados.decisao.porId[p.id];
                      return (
                        <article key={p.id} className={s.item}>
                          <div className={s.mark}>
                            <strong>{p.marca}</strong>
                            {Number(p.prioridade) > 0 && (
                              <span className={s.priority}>
                                Prioridade {p.prioridade}
                              </span>
                            )}
                            <small>
                              {p.perfil || p.descricao || "Peça da lista"}
                            </small>
                          </div>
                          <div className={s.quantity}>
                            <b>{numero(d.saldo)}</b>
                            <small>peças de saldo</small>
                          </div>
                          <div className={s.reason}>
                            {d.estado === "LIBERAR" ? (
                              <span className={s.ready}>
                                <CheckCircle2 size={16} /> Conferências prontas
                              </span>
                            ) : (
                              d.estado === "EM_ANDAMENTO" && (
                                <b>Já liberada / em execução</b>
                              )
                            )}
                            {!!d.motivos.length && (
                              <p>{d.motivos.join(" · ")}</p>
                            )}
                            {!!d.rs.length && (
                              <small>R: {d.rs.join(", ")}</small>
                            )}
                            {d.materialHerdado && (
                              <small>R vinculado aos croquis</small>
                            )}
                            {p.travaConjuntos > 0 && (
                              <p className={s.impact}>
                                <Scissors size={14} /> Corte necessário para{" "}
                                {p.travaConjuntos} conjunto(s):{" "}
                                {(p.travaMarcas || []).join(", ")}
                                {p.travaConjuntos > (p.travaMarcas?.length || 0)
                                  ? "…"
                                  : ""}
                              </p>
                            )}
                          </div>
                          <Link className={s.link} href={href(p.marca)}>
                            Conferir peça <ArrowUpRight size={15} />
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                )}
                {linhas.length > limite && (
                  <button
                    className={s.more}
                    onClick={() => setLimite((v) => v + 20)}
                  >
                    Mostrar mais {Math.min(20, linhas.length - limite)} marcas
                  </button>
                )}
                <p className={s.meta}>
                  Pasta da Engenharia:{" "}
                  {dados.decisao.pastaConferidaEm
                    ? new Date(dados.decisao.pastaConferidaEm).toLocaleString(
                        "pt-BR",
                      )
                    : "conferência pendente"}
                  . A atualização consulta os registros do portal; a
                  reconferência da pasta continua na Engenharia. A emissão da
                  GRD valida os arquivos novamente.
                </p>
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
