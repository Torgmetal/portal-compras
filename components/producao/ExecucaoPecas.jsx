"use client";
import { useState } from "react";
import { Download, FileText, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import ConfirmModal from "@/components/admin/ConfirmModal";
import FichaPecaModal from "@/components/FichaPecaModal";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";
import {
  ETAPAS,
  resumirPeca,
  agruparMateriais,
} from "@/lib/producao-operacional";
import {
  useConsulta,
  EstadoConsulta,
  Vazio,
  Atualizar,
  botao,
  campo,
  fmt,
} from "./ConsultaOperacional";
const SITUACOES = {
  PENDENTES: "Com saldo a executar",
  TODOS: "Todas as situações",
  A_INICIAR: "Sem apontamento",
  EM_ANDAMENTO: "Em andamento",
  PENDENCIA: "Com pendências",
  CONCILIAR: "Conciliação de etapa anterior",
  CONCLUIDA: "Quantidade concluída",
};
const PROGRAMACAO = {
  NAO_LANCADA: "Ordem não lançada",
  LIBERADA_SEM_ORDEM: "GRD emitida; ordem pendente",
  OUTRO_SETOR: "Ordem em outro setor",
  PROGRAMADA: "Programada",
  INICIADA: "Iniciada no MES",
};
export default function ExecucaoPecas({
  op,
  setor,
  setSetor,
  materiais = false,
  somenteLeitura = false,
}) {
  const [tudo, setTudo] = useState(false),
    [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState("PENDENTES"),
    [pagina, setPagina] = useState(1);
  const [marca, setMarca] = useState(null),
    [desenho, setDesenho] = useState(null),
    [baixa, setBaixa] = useState(null),
    [confirmar, setConfirmar] = useState(false),
    [salvando, setSalvando] = useState(false);
  const { showToast } = useStore();
  const estado = useConsulta(
    `/api/pcp/despacho?${new URLSearchParams({ opId: op.opId, setor, tudo: tudo ? "1" : "0" })}`,
  );
  const pecas = estado.dados?.pecas || [];
  const linhas = pecas.map((p) => ({ ...p, resumo: resumirPeca(p) }));
  const filtradas = linhas.filter(
    (p) =>
      (materiais ||
        filtro === "TODOS" ||
        (filtro === "PENDENTES" &&
          p.resumo.saldo > 0 &&
          p.resumo.situacao !== "CONCILIAR") ||
        p.resumo.situacao === filtro) &&
      `${p.marca} ${p.descricao || ""} ${p.perfil || ""} ${p.material?.rastreio || ""}`
        .toLowerCase()
        .includes(busca.toLowerCase()),
  );
  const totais = filtradas.reduce(
    (a, p) => ({
      total: a.total + p.resumo.total,
      feito: a.feito + Math.min(p.resumo.total, p.resumo.feito),
      saldo: a.saldo + p.resumo.saldo,
    }),
    { total: 0, feito: 0, saldo: 0 },
  );
  async function salvarBaixa() {
    if (
      somenteLeitura ||
      !baixa ||
      !Number.isInteger(Number(baixa.qtd)) ||
      Number(baixa.qtd) < 0 ||
      Number(baixa.qtd) > Number(baixa.peca.qte)
    )
      return;
    setSalvando(true);
    try {
      const r = await fetch("/api/pcp/despacho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Number(baixa.qtd) === 0
            ? { baixaSetor: setor, reverterBaixa: true, ids: [baixa.peca.id] }
            : {
                baixaSetor: setor,
                baixas: [{ id: baixa.peca.id, qtd: Number(baixa.qtd) }],
              },
        ),
      });
      const d = await r.json();
      if (!r.ok || !d.atualizados)
        throw new Error(d.error || "Nenhum registro atualizado.");
      const id = baixa.peca.id,
        qtd = Number(baixa.qtd);
      estado.atualizar((anterior) => ({
        ...anterior,
        pecas: anterior.pecas.map((p) =>
          p.id === id ? { ...p, baixadoQtd: qtd, baixadoPortal: qtd > 0 } : p,
        ),
      }));
      showToast("Quantidade registrada no portal.", "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSalvando(false);
      setConfirmar(false);
      setBaixa(null);
    }
  }
  async function exportar() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        filtradas.map((p) => ({
          OP: op.opNumero,
          Etapa: ETAPAS[setor],
          Marca: p.marca,
          Perfil: p.perfil,
          Quantidade: p.resumo.total,
          Apontada: p.resumo.feito,
          Saldo: p.resumo.saldo,
          R: p.material?.rastreio || "",
          Pendencias: p.resumo.motivos.join("; "),
        })),
      ),
      "Peças",
    );
    XLSX.writeFile(wb, `OP-${op.opNumero}-${setor}.xlsx`);
  }
  return (
    <div className="space-y-4">
      {somenteLeitura && (
        <p className="text-sm rounded-lg bg-gray-100 p-3 text-torg-gray">
          Consulta histórica. Os apontamentos desta OP não podem ser alterados
          nesta tela.
        </p>
      )}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs text-torg-gray">
          Etapa
          <select
            aria-label="Etapa"
            value={setor}
            className={`${campo} block mt-1`}
            onChange={(e) => {
              setSetor(e.target.value);
              setPagina(1);
              setBaixa(null);
            }}
          >
            {Object.entries(ETAPAS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-torg-gray">
          Escopo
          <select
            aria-label="Escopo das peças"
            value={tudo ? "todas" : "lote"}
            className={`${campo} block mt-1`}
            onChange={(e) => {
              setTudo(e.target.value === "todas");
              setPagina(1);
            }}
          >
            <option value="lote">Lote liberado para a fábrica</option>
            <option value="todas">Todas as peças da etapa</option>
          </select>
        </label>
        <div className="ml-auto">
          <Atualizar
            onClick={estado.recarregar}
            disabled={estado.carregando || salvando}
          />
        </div>
      </div>
      <EstadoConsulta estado={estado}>
        <div className="text-xs text-torg-gray flex flex-wrap gap-x-5 gap-y-1">
          <span>
            MES:{" "}
            {estado.dados?.ordensSincronizadasEm
              ? new Date(estado.dados.ordensSincronizadasEm).toLocaleString(
                  "pt-BR",
                )
              : "sem data de sincronização disponível"}
          </span>
          <span>
            {fmt(estado.dados?.entreguesAExpedicao)} registros já transferidos à
            Expedição, fora desta lista
          </span>
        </div>
        {!!estado.dados?.romaneioSemProducao && (
          <p className="p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">
            {fmt(estado.dados.romaneioSemProducao)} registros constam em
            romaneio sem produção conciliada. Confira a ficha antes de apontar
            novamente.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 flex-1 min-w-0 bg-white border rounded-lg px-3">
            <Search size={17} />
            <input
              aria-label="Buscar marca, perfil ou R"
              placeholder="Buscar marca, perfil ou R…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              className="min-w-0 w-full min-h-11 text-sm outline-none"
            />
          </label>
          {!materiais && (
            <select
              aria-label="Situação das peças"
              value={filtro}
              onChange={(e) => {
                setFiltro(e.target.value);
                setPagina(1);
              }}
              className={campo}
            >
              {Object.entries(SITUACOES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <button
            className={`${botao} flex items-center gap-2`}
            onClick={exportar}
            disabled={!filtradas.length}
          >
            <Download size={16} />
            Exportar seleção
          </button>
        </div>
        {materiais ? (
          <>
            <p className="text-sm text-torg-gray">
              Materiais vinculados às peças desta etapa e deste escopo. O
              recebimento e o R não comprovam saldo livre no estoque.
            </p>
            <div className="grid xl:grid-cols-2 gap-4">
              {agruparMateriais(filtradas).map((g) => (
                <article
                  key={g.perfil}
                  className="p-5 bg-white border rounded-xl space-y-3"
                >
                  <div className="flex justify-between gap-3">
                    <h3 className="font-semibold text-torg-dark">{g.perfil}</h3>
                    <span className="text-sm">{fmt(g.unidades)} un.</span>
                  </div>
                  <p
                    className={`text-sm ${g.recebido ? "text-emerald-700" : "text-amber-800"}`}
                  >
                    {g.recebido
                      ? "Há recebimento vinculado"
                      : "Recebimento não confirmado nesta consulta"}
                  </p>
                  {g.rastreios.length ? (
                    g.rastreios.map((r) => (
                      <p
                        key={r.rastreio}
                        className="p-3 bg-gray-50 rounded-lg text-sm break-words"
                      >
                        <strong>R: {r.rastreio}</strong> · Corrida:{" "}
                        {r.corrida || "não informada"} · NF:{" "}
                        {r.nf || "não informada"}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-torg-gray">
                      R não localizado. Consulte a ficha para conferir o vínculo
                      do material.
                    </p>
                  )}
                  <details>
                    <summary className="cursor-pointer py-2 text-torg-blue text-sm">
                      Ver {g.marcas.length} registros de peças
                    </summary>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {g.marcas.map((p) => (
                        <button
                          key={p.id}
                          className={botao}
                          onClick={() => setMarca(p.marca)}
                        >
                          {p.marca} · {fmt(p.qte)} un.
                        </button>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 rounded-xl border bg-white divide-x">
              <Medida titulo="Na seleção" valor={totais.total} />
              <Medida titulo="Apontadas na etapa" valor={totais.feito} />
              <Medida titulo="Saldo sem apontamento" valor={totais.saldo} />
            </div>
            <p className="text-xs text-torg-gray">
              Quantidades em unidades. A mesma peça pode passar por várias
              etapas; não some os saldos entre setores. Apontamento do portal e
              do MES não são somados entre si.
            </p>
            <div className="space-y-3">
              {filtradas.slice((pagina - 1) * 40, pagina * 40).map((p) => (
                <article
                  key={p.id}
                  className="bg-white border border-gray-100 shadow-sm rounded-xl p-4 sm:p-5"
                >
                  <div className="grid lg:grid-cols-[minmax(180px,1.1fr)_minmax(210px,1fr)_minmax(200px,1.2fr)] gap-4">
                    <div className="min-w-0">
                      <button
                        onClick={() => setMarca(p.marca)}
                        className="font-bold text-lg text-torg-blue text-left break-all min-h-11"
                      >
                        {p.marca}
                      </button>
                      <p className="text-sm text-torg-gray break-words">
                        {p.perfil || p.descricao || "Sem descrição"}
                      </p>
                      <p className="text-xs text-torg-gray mt-2">
                        Última etapa apontada:{" "}
                        {ETAPAS[p.setorReal] || "Sem apontamento MES"}
                      </p>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>{fmt(p.resumo.feito)} apontadas</span>
                        <strong>{fmt(p.resumo.total)} un.</strong>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-torg-blue"
                          style={{
                            width: `${p.resumo.total ? Math.min(100, (p.resumo.feito / p.resumo.total) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <p className="text-sm mt-2 font-semibold">
                        {p.resumo.situacao === "CONCILIAR"
                          ? "A conciliar"
                          : "Saldo"}
                        : {fmt(p.resumo.saldo)} un.
                      </p>
                      <p className="text-xs text-torg-gray mt-1">
                        {PROGRAMACAO[p.programacao?.situacao] ||
                          "Programação não informada"}
                      </p>
                    </div>
                    <div>
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-semibold ${["PENDENCIA", "CONCILIAR"].includes(p.resumo.situacao) ? "bg-amber-50 text-amber-900" : p.resumo.situacao === "CONCLUIDA" ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-torg-blue"}`}
                      >
                        {SITUACOES[p.resumo.situacao]}
                      </span>
                      <p className="mt-2 text-sm text-torg-dark">
                        {p.resumo.proxima}
                      </p>
                      {p.resumo.motivos.length > 1 && (
                        <p className="text-xs text-amber-900 mt-1">
                          {p.resumo.motivos.slice(1).join(" · ")}
                        </p>
                      )}
                      {p.avancouAlem && p.resumo.saldo > 0 && (
                        <p className="text-xs text-amber-900 mt-1">
                          Há apontamento posterior; confira a conciliação desta
                          etapa.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4 border-t pt-3">
                    <button className={botao} onClick={() => setMarca(p.marca)}>
                      Ficha e rastreabilidade
                    </button>
                    {!somenteLeitura && (
                      <button
                        className={`${botao} flex gap-2 items-center`}
                        onClick={() => setDesenho(p.marca)}
                      >
                        <FileText size={15} />
                        Desenho
                      </button>
                    )}
                    {!somenteLeitura &&
                      !Number(p.produzidoSyneco) &&
                      p.resumo.total > 0 &&
                      !p.resumo.motivos.length && (
                        <button
                          className={`${botao} text-torg-blue`}
                          onClick={() =>
                            setBaixa({
                              peca: p,
                              qtd: String(p.baixadoQtd || 0),
                            })
                          }
                        >
                          Registrar quantidade
                        </button>
                      )}
                  </div>
                  {baixa?.peca.id === p.id && (
                    <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                      <label className="text-sm block">
                        Total já concluído em {ETAPAS[setor]} (não é quantidade
                        adicional)
                        <input
                          type="number"
                          min="0"
                          max={p.qte}
                          step="1"
                          aria-label={`Quantidade concluída de ${p.marca}`}
                          className={`${campo} block mt-2 w-full sm:w-40`}
                          value={baixa.qtd}
                          onChange={(e) =>
                            setBaixa((b) => ({ ...b, qtd: e.target.value }))
                          }
                        />
                      </label>
                      <p className="text-xs text-torg-gray mt-2">
                        Registra no portal. Utilize o MES quando houver
                        apontamento da máquina.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          className={botao}
                          onClick={() => setBaixa(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          className={`${botao} text-torg-blue`}
                          disabled={
                            baixa.qtd === "" ||
                            !Number.isInteger(Number(baixa.qtd)) ||
                            Number(baixa.qtd) < 0 ||
                            Number(baixa.qtd) > p.resumo.total
                          }
                          onClick={() => setConfirmar(true)}
                        >
                          Revisar e salvar
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {filtradas.length > 40 && (
              <div className="flex justify-between items-center">
                <button
                  className={botao}
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => p - 1)}
                >
                  Anterior
                </button>
                <span className="text-sm">
                  {pagina} / {Math.ceil(filtradas.length / 40)}
                </span>
                <button
                  className={botao}
                  disabled={pagina * 40 >= filtradas.length}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
        {!filtradas.length && (
          <Vazio>
            Nenhuma peça neste escopo e filtro. Confira a etapa ou consulte
            todas as peças da etapa.
          </Vazio>
        )}
      </EstadoConsulta>
      {marca && (
        <FichaPecaModal
          opId={op.opId}
          marca={marca}
          onClose={() => setMarca(null)}
        />
      )}
      {desenho && (
        <DesenhoPecaModal
          opId={op.opId}
          opNumero={op.opNumero}
          marca={desenho}
          setor={setor}
          onClose={() => setDesenho(null)}
        />
      )}
      <ConfirmModal
        open={confirmar}
        onClose={() => {
          if (!salvando) setConfirmar(false);
        }}
        onConfirm={salvarBaixa}
        loading={salvando}
        variant="padrao"
        titulo="Confirmar apontamento"
        mensagem={`OP ${op.opNumero} · ${baixa?.peca.marca}\n${ETAPAS[setor]}: total concluído de ${baixa?.qtd} unidade(s), de ${baixa?.peca.qte}.\nO total manual anterior será substituído.`}
        labelConfirmar="Salvar quantidade"
      />
    </div>
  );
}
function Medida({ titulo, valor }) {
  return (
    <div className="p-3 sm:p-5">
      <p className="text-xs text-torg-gray">{titulo}</p>
      <p className="text-xl sm:text-3xl font-semibold text-torg-dark mt-1">
        {fmt(valor)}
      </p>
    </div>
  );
}
