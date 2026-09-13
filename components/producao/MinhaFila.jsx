"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Scissors,
  Hammer,
  Flame,
  Sparkles,
  Wind,
  Paintbrush,
  ChevronRight,
  FileText,
  Box,
  SlidersHorizontal,
} from "lucide-react";
import { ETAPAS } from "@/lib/producao-operacional";
import { montarFilaOperador } from "@/lib/fila-operador";
import FichaPecaModal from "@/components/FichaPecaModal";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";
import {
  useConsulta,
  EstadoConsulta,
  botao,
  campo,
  fmt,
  data,
  Atualizar,
} from "./ConsultaOperacional";
const SETORES = {
  CORTE: Scissors,
  MONTAGEM: Hammer,
  SOLDA: Flame,
  ACABAMENTO: Sparkles,
  JATO: Wind,
  PINTURA: Paintbrush,
};
const VERBOS = {
  CORTE: "Cortar",
  MONTAGEM: "Montar",
  SOLDA: "Soldar",
  ACABAMENTO: "Dar acabamento",
  JATO: "Jatear",
  PINTURA: "Pintar",
};
const CHAVE = "torg.producao.meu-posto.v1";
export default function MinhaFila() {
  const [posto, setPosto] = useState(null),
    [escolher, setEscolher] = useState(false),
    [carregado, setCarregado] = useState(false),
    [aba, setAba] = useState("hoje"),
    [aberto, setAberto] = useState(null),
    [desenho, setDesenho] = useState(null),
    [ficha, setFicha] = useState(null);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (p && SETORES[p.setor])
        setPosto({
          setor: p.setor,
          recurso: typeof p.recurso === "string" ? p.recurso : "",
        });
    } catch {}
    setCarregado(true);
  }, []);
  const estado = useConsulta(
    posto ? `/api/producao/fila?setor=${posto.setor}` : null,
    true,
  );
  useEffect(() => {
    if (!posto) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") estado.recarregar();
    }, 60000);
    return () => clearInterval(id);
  }, [posto, estado.recarregar]);
  function escolherPosto(setor, recurso = "") {
    const p = { setor, recurso };
    setPosto(p);
    setEscolher(false);
    setAberto(null);
    setAba("hoje");
    setDesenho(null);
    setFicha(null);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(p));
    } catch {}
  }
  const fila = montarFilaOperador(
    estado.dados?.lotes,
    posto?.setor,
    posto?.recurso,
    estado.dados?.hoje || "",
  );
  const recursos = [
    ...new Set([
      ...(estado.dados?.recursos?.[posto?.setor] || []),
      ...(estado.dados?.lotes || [])
        .filter((l) => l.setor === posto?.setor && l.recurso)
        .map((l) => l.recurso),
    ]),
  ].sort();
  if (!carregado)
    return (
      <p role="status" className="p-5 text-torg-gray">
        Abrindo seu posto…
      </p>
    );
  if (!posto || escolher)
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-blue">
            Produção
          </p>
          <h1 className="text-3xl font-bold text-torg-dark mt-2">
            Em qual setor você trabalha?
          </h1>
          <p className="text-torg-gray mt-3">
            Escolha uma vez. Neste aparelho, o portal vai abrir direto na sua
            fila.
          </p>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(SETORES).map(([s, Icon]) => (
            <button
              key={s}
              onClick={() => escolherPosto(s)}
              className="bg-white text-torg-dark border rounded-xl p-5 min-h-28 text-left hover:border-torg-blue"
            >
              <Icon className="text-torg-blue mb-3" />
              <span className="font-semibold">{ETAPAS[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {posto && (
            <button className={botao} onClick={() => setEscolher(false)}>
              Voltar ao meu trabalho
            </button>
          )}
          <Link href="/producao/gestao" className={botao}>
            Gestão das OPs
          </Link>
          <Link
            href="/producao/modelo"
            className={`${botao} flex items-center gap-2`}
          >
            <Box size={16} />
            Modelo 3D
          </Link>
        </div>
      </div>
    );
  return (
    <div className="max-w-4xl mx-auto min-w-0 space-y-5">
      <header className="flex justify-between items-start gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-torg-blue">
            Meu trabalho
          </p>
          <h1 className="text-2xl font-bold text-torg-dark mt-1">
            {ETAPAS[posto.setor]}
          </h1>
        </div>
        <button
          className={`${botao} flex items-center gap-2`}
          onClick={() => setEscolher(true)}
        >
          <SlidersHorizontal size={16} />
          Trocar setor
        </button>
      </header>
      <div className="flex items-end gap-2">
        <label className="text-xs text-torg-gray flex-1 min-w-0">
          Minha bancada / máquina
          <select
            aria-label="Minha bancada ou máquina"
            className={`${campo} block w-full mt-1`}
            value={posto.recurso}
            onChange={(e) => escolherPosto(posto.setor, e.target.value)}
          >
            <option value="">Todo o setor</option>
            {posto.recurso && !recursos.includes(posto.recurso) && (
              <option value={posto.recurso}>{posto.recurso}</option>
            )}
            {recursos.map((r) => (
              <option key={r} value={r}>
                {r.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <Atualizar
          onClick={estado.recarregar}
          disabled={estado.carregando || estado.atualizando}
        />
      </div>
      <EstadoConsulta estado={estado}>
        <nav
          className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-xl"
          aria-label="Fila de trabalho"
        >
          {[
            ["hoje", "Para fazer"],
            ["aguardando", "Aguardando"],
            ["proximos", "Próximos dias"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={`min-h-12 rounded-lg px-1 py-2 text-xs sm:text-sm font-semibold ${aba === k ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray"}`}
              aria-pressed={aba === k}
              onClick={() => {
                setAba(k);
                setAberto(null);
              }}
            >
              {l} <span className="ml-1">{fila[k].length}</span>
            </button>
          ))}
        </nav>
        {aba === "hoje" && (
          <div>
            <h2 className="font-bold text-lg text-torg-dark">
              {posto.recurso ? "Na sua bancada" : "Programado para o setor"}
            </h2>
            <p className="text-sm text-torg-gray mt-1">
              {posto.recurso
                ? "Peças programadas para hoje e saldos anteriores."
                : "Escolha a bancada acima para ver só o seu trabalho."}
            </p>
          </div>
        )}
        {aba === "aguardando" && (
          <p className="text-sm text-amber-900">
            Estes lotes dependem de definição do PCP, liberação da etapa ou
            resolução da pendência indicada.
          </p>
        )}
        {aba === "proximos" && (
          <p className="text-sm text-torg-gray">
            Programação futura. As datas indicam quando cada lote está previsto.
          </p>
        )}
        {!fila[aba].length && (
          <div className="rounded-xl bg-white border p-6">
            <h2 className="font-semibold text-torg-dark">
              {aba === "hoje"
                ? "Nenhum lote programado para agora"
                : aba === "aguardando"
                  ? "Nenhuma pendência nesta seleção"
                  : "Sem programação futura nesta seleção"}
            </h2>
            <p className="text-sm text-torg-gray mt-2">
              {aba === "hoje"
                ? "Confira “Aguardando” ou solicite ao PCP a programação da próxima atividade."
                : "A fila será atualizada quando houver novos registros."}
            </p>
          </div>
        )}
        <div className="space-y-4">
          {fila[aba].map((l) => (
            <article
              key={l.id}
              className={`bg-white border rounded-xl overflow-hidden ${aba === "hoje" ? "border-l-4 border-l-torg-blue" : ""}`}
            >
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-torg-gray">
                      {l.recurso?.replaceAll("_", " ") || "Sem posto definido"}
                      {aba === "proximos" ? ` · ${data(l.dia)}` : ""}
                    </p>
                    <h3 className="font-bold text-xl text-torg-dark mt-1">
                      {VERBOS[posto.setor]} · OP {l.op}
                    </h3>
                    <p className="text-sm text-torg-gray truncate mt-1">
                      {l.obra || "Obra sem descrição"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <strong className="block text-3xl text-torg-dark">
                      {fmt(l.saldo)}
                    </strong>
                    <span className="text-xs text-torg-gray">
                      peças restantes
                    </span>
                  </div>
                </div>
                {aba === "aguardando" ? (
                  <div className="text-sm bg-amber-50 text-amber-900 p-3 rounded-lg mt-3">
                    {[...new Set(l.itens.map((i) => i.motivo))].map((m) => (
                      <p key={m}>{m}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-torg-dark mt-4 break-words">
                    {l.itens
                      .slice(0, 3)
                      .map((i) => `${i.m} (${fmt(i.saldo)})`)
                      .join(" · ")}
                    {l.itens.length > 3
                      ? ` · +${l.itens.length - 3} marcas`
                      : ""}
                  </p>
                )}
                <button
                  className={`mt-4 min-h-12 w-full flex justify-between items-center px-4 rounded-lg font-semibold text-sm ${aba === "hoje" ? "bg-torg-blue text-white" : "border text-torg-dark"}`}
                  aria-expanded={aberto === l.id}
                  onClick={() => setAberto(aberto === l.id ? null : l.id)}
                >
                  {aberto === l.id
                    ? "Recolher peças"
                    : `Ver peças${aba === "hoje" ? " e desenhos" : ""}`}
                  <ChevronRight
                    size={18}
                    className={aberto === l.id ? "rotate-90" : ""}
                  />
                </button>
              </div>
              {aberto === l.id && (
                <div className="border-t divide-y">
                  {l.itens.map((i, k) => (
                    <div
                      key={`${i.id}-${i.inicioUnidade || 0}-${k}`}
                      className="p-4 sm:px-5"
                    >
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-torg-dark break-all">
                            {i.m}
                          </p>
                          {i.pf && (
                            <p className="text-xs text-torg-gray mt-1">
                              {i.pf}
                            </p>
                          )}
                          <p className="text-xs text-torg-gray mt-1">
                            {fmt(i.f)} de {fmt(i.q)} apontadas nesta seleção
                          </p>
                        </div>
                        <strong className="shrink-0 text-lg">
                          {fmt(i.saldo)} un.
                        </strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          disabled={!l.opId}
                          className={`${botao} !text-torg-blue flex justify-center items-center gap-2`}
                          onClick={() =>
                            setDesenho({
                              opId: l.opId,
                              opNumero: l.op,
                              marca: i.m,
                            })
                          }
                        >
                          <FileText size={16} />
                          Desenho
                        </button>
                        <button
                          disabled={!l.opId}
                          className={botao}
                          onClick={() => setFicha({ opId: l.opId, marca: i.m })}
                        >
                          Ficha e material
                        </button>
                      </div>
                      {i.motivo && (
                        <p className="text-xs text-amber-900 mt-2">
                          {i.motivo}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
        <p className="text-xs text-torg-gray">
          Atualizado às{" "}
          {estado.dados?.geradoEm
            ? new Date(estado.dados.geradoEm).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}{" "}
          · atualização automática a cada minuto
        </p>
      </EstadoConsulta>
      <footer className="border-t pt-4 flex flex-wrap justify-between gap-3 text-sm">
        <Link
          className="min-h-11 flex items-center text-torg-blue"
          href="/producao/modelo"
        >
          <Box size={17} className="mr-2" />
          Consultar 3D
        </Link>
        <Link
          className="min-h-11 flex items-center text-torg-gray"
          href="/producao/gestao"
        >
          Gestão das OPs
        </Link>
      </footer>
      {desenho && (
        <DesenhoPecaModal
          {...desenho}
          setor={posto.setor}
          onClose={() => setDesenho(null)}
        />
      )}
      {ficha && <FichaPecaModal {...ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
