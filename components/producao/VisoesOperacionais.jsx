"use client";
import { useState } from "react";
import FichaPecaModal from "@/components/FichaPecaModal";
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
export function CargaPreparacao() {
  const estado = useConsulta("/api/pcp/carga-corte");
  const d = estado.dados;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-torg-dark">
            Carga da preparação
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Comprometimento do corte e distribuição entre máquinas.
          </p>
        </div>
        <Atualizar onClick={estado.recarregar} disabled={estado.carregando} />
      </div>
      <EstadoConsulta estado={estado}>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            ["Carga pendente", `${fmt(d?.preparacao?.backlogKg)} kg`],
            ["Meta diária do setor", `${fmt(d?.metaKgDia)} kg/dia`],
            ["Dias pela meta do setor", fmt(d?.preparacao?.dias, 1)],
          ].map(([l, v]) => (
            <div key={l} className="bg-white border rounded-xl p-5">
              <p className="text-sm text-torg-gray">{l}</p>
              <strong className="block text-2xl mt-2 text-torg-dark">
                {v}
              </strong>
            </div>
          ))}
        </div>
        <p className="text-sm text-torg-gray">
          Os dias são calculados pela meta da preparação inteira. Não
          representam a capacidade individual da máquina nem uma promessa de
          entrega. O ritmo histórico considera os dias com produção nos últimos
          30 dias.
        </p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {d?.maquinas?.map((m) => (
            <article key={m.maquina} className="bg-white border rounded-xl p-5">
              <h3 className="font-bold text-torg-dark">{m.label}</h3>
              <p className="text-3xl font-semibold mt-4">
                {fmt(m.backlogKg)}{" "}
                <span className="text-base font-normal text-torg-gray">
                  kg pendentes
                </span>
              </p>
              <dl className="mt-5 text-sm space-y-3">
                <Linha titulo="Registros na fila" valor={fmt(m.backlogPecas)} />
                <Linha
                  titulo="Unidades apontadas em ordens em andamento"
                  valor={fmt(m.emAndamentoPecas)}
                />
                <Linha
                  titulo="Ritmo histórico"
                  valor={
                    m.ritmoRealKgDia
                      ? `${fmt(m.ritmoRealKgDia)} kg/dia`
                      : "Sem medição"
                  }
                />
                <Linha
                  titulo="Parcela da carga do setor"
                  valor={`${fmt(m.diasCarga, 1)} dias`}
                />
              </dl>
            </article>
          ))}
        </div>
        <div className="p-5 rounded-xl bg-amber-50 text-amber-900">
          <h3 className="font-semibold">Definição de máquina e liberação</h3>
          <p className="text-sm mt-2">
            {fmt(d?.semMaquina?.pecas)} registros em corte sem máquina definida
            · {fmt(d?.semMaquina?.kg)} kg.
          </p>
          <p className="text-sm mt-1">
            {fmt(d?.pendentes?.pecas)} registros de fabricação aguardando
            liberação · {fmt(d?.pendentes?.kg)} kg. Este volume ainda não
            integra a carga acima.
          </p>
        </div>
      </EstadoConsulta>
    </div>
  );
}
function Linha({ titulo, valor }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-torg-gray">{titulo}</dt>
      <dd className="font-medium text-right">{valor}</dd>
    </div>
  );
}
export function QualidadeOP({ op }) {
  const [resultado, setResultado] = useState("TODOS"),
    [pagina, setPagina] = useState(1),
    [marca, setMarca] = useState(null);
  const estado = useConsulta(
    `/api/producao/qualidade?${new URLSearchParams({ opId: op.opId, resultado, pagina })}`,
  );
  const d = estado.dados;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <select
          aria-label="Resultado da inspeção"
          className={campo}
          value={resultado}
          onChange={(e) => {
            setResultado(e.target.value);
            setPagina(1);
          }}
        >
          <option value="TODOS">Todos os resultados</option>
          <option value="APROVADO">Aprovado</option>
          <option value="REPROVADO">Reprovado</option>
          <option value="REC">REC</option>
          <option value="PENDENTE">Sem resultado</option>
        </select>
        <Atualizar onClick={estado.recarregar} disabled={estado.carregando} />
      </div>
      <p className="text-sm text-torg-gray">
        Confira o resultado e as marcas de cada inspeção. Rascunho não é
        liberação e um relatório aprovado não libera toda a OP.
      </p>
      <EstadoConsulta estado={estado}>
        <p className="text-sm text-torg-gray">
          {fmt(d?.total)} relatórios encontrados
        </p>
        <div className="grid lg:grid-cols-2 gap-4">
          {d?.relatorios.map((r) => (
            <article
              key={r.id}
              className="bg-white rounded-xl border p-5 space-y-3"
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-bold text-torg-dark">
                  {r.codigo} · R{String(r.revisao).padStart(2, "0")}
                </h3>
                <span
                  className={`text-xs rounded px-2 py-1 ${r.resultadoInspecao === "REPROVADO" ? "bg-red-50 text-red-800" : "bg-gray-100 text-torg-dark"}`}
                >
                  {r.resultadoInspecao || "Sem resultado"}
                </span>
              </div>
              <p className="text-sm text-torg-gray">
                {r.tipo?.replaceAll("_", " ")} · {r.status} ·{" "}
                {r.emitidoEm ? data(r.emitidoEm) : "Ainda não emitido"}
              </p>
              <details>
                <summary className="min-h-11 cursor-pointer text-torg-blue text-sm py-2">
                  Conferir marcas inspecionadas
                </summary>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(r.marcas) ? r.marcas : [])
                    .filter((m) => typeof m === "string")
                    .map((m, i) => (
                      <button
                        key={`${m}-${i}`}
                        className={botao}
                        onClick={() => setMarca(m)}
                      >
                        {m}
                      </button>
                    ))}
                </div>
              </details>
            </article>
          ))}
        </div>
        {!d?.relatorios.length && (
          <Vazio>Nenhuma inspeção encontrada nesta seleção.</Vazio>
        )}
        <Paginacao
          pagina={pagina}
          paginas={d?.paginas || 1}
          mudar={setPagina}
        />
      </EstadoConsulta>
      {marca && (
        <FichaPecaModal
          opId={op.opId}
          marca={marca}
          onClose={() => setMarca(null)}
        />
      )}
    </div>
  );
}
export function ExpedicaoOP({ op }) {
  const [pagina, setPagina] = useState(1),
    [marca, setMarca] = useState(null);
  const estado = useConsulta(
    `/api/producao/expedicao?${new URLSearchParams({ opId: op.opId, pagina })}`,
  );
  const d = estado.dados;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <p className="text-sm text-torg-gray">
          Romaneios registrados, peças, destino e situação da NF. Registro de
          romaneio não comprova recebimento pelo cliente.
        </p>
        <Atualizar onClick={estado.recarregar} disabled={estado.carregando} />
      </div>
      <EstadoConsulta estado={estado}>
        {d?.romaneios.map((r) => (
          <article
            key={r.id}
            className="bg-white border rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="font-bold text-torg-dark">Romaneio {r.numero}</h3>
              <span className="text-sm">
                {data(r.data)} · {fmt(r.pesoRealKg)} kg
              </span>
            </div>
            <p className="text-sm text-torg-gray">
              Destino: {r.destino || "Não informado"} · NF:{" "}
              {r.nfNumero || r.nfStatus || "Não informada"}
            </p>
            <details>
              <summary className="cursor-pointer text-torg-blue min-h-11 py-2">
                Conferir {r.itens.length} itens do romaneio
              </summary>
              <div className="divide-y">
                {r.itens.map((i) => (
                  <div
                    key={i.id}
                    className="flex gap-3 justify-between items-center py-2 text-sm"
                  >
                    <button
                      disabled={!i.pecaConjunto?.marca}
                      className="min-h-11 text-left text-torg-blue break-words disabled:text-torg-gray"
                      onClick={() => setMarca(i.pecaConjunto.marca)}
                    >
                      {i.pecaConjunto?.marca || i.descricao}
                    </button>
                    <span className="shrink-0 font-semibold">
                      {fmt(i.qtd)} un.
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </article>
        ))}
        {!d?.romaneios.length && (
          <Vazio>Nenhum romaneio registrado nesta OP.</Vazio>
        )}
        <Paginacao
          pagina={pagina}
          paginas={d?.paginas || 1}
          mudar={setPagina}
        />
      </EstadoConsulta>
      {marca && (
        <FichaPecaModal
          opId={op.opId}
          marca={marca}
          onClose={() => setMarca(null)}
        />
      )}
    </div>
  );
}
function Paginacao({ pagina, paginas, mudar }) {
  return paginas > 1 ? (
    <div className="flex items-center justify-between">
      <button
        className={botao}
        disabled={pagina <= 1}
        onClick={() => mudar((p) => p - 1)}
      >
        Anterior
      </button>
      <span className="text-sm">
        {pagina} / {paginas}
      </span>
      <button
        className={botao}
        disabled={pagina >= paginas}
        onClick={() => mudar((p) => p + 1)}
      >
        Próxima
      </button>
    </div>
  ) : null;
}
