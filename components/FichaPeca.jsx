"use client";
import { Star } from "lucide-react";
const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("pt-BR");
const fmtKg = (n) => n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
const ETAPAS = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
export default function FichaPeca({ d }) {
  const p = d.pecas?.[0] || {};
  const feitos = new Set((d.fabrica?.trilha || []).map((t) => t.setor));
  return (
    <div className="space-y-3 min-w-0 break-words [overflow-wrap:anywhere]">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="font-mono text-[17px] font-bold text-torg-dark">{d.marca}</h3>
        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-torg-blue-200 bg-torg-blue-50 text-torg-blue">
          {p.tipoPeca === "CONJUNTO" ? "conjunto" : p.tipoPeca === "CROQUI" ? "croqui" : "marca"}
        </span>
        {d.fabrica?.setorAtual && (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
            {d.fabrica.setorAtual}
          </span>
        )}
        {p.prioridade ? (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-torg-orange-200 bg-orange-50 text-torg-orange-700 inline-flex items-center gap-1">
            <Star size={10} className="fill-current" /> prioridade {p.prioridade}
          </span>
        ) : null}
      </div>

      {d.pecas?.length > 1 && <p className="text-sm text-amber-800">Esta marca possui {d.pecas.length} registros. Confira a frente e o perfil; os dados abaixo de rastreabilidade e produção abrangem a marca nesta OP.</p>}
      {(d.pecas || []).map((p, i) => <Bloco key={p.id || i} titulo={d.pecas.length > 1 ? `Registro ${i + 1} · ${p.opNumero || "sem frente"}` : "A peça"}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
          <dt className="text-torg-gray">Descrição</dt><dd className="font-medium">{p.descricao || "—"}</dd>
          <dt className="text-torg-gray">Perfil</dt><dd className="font-mono font-medium">{p.perfil || "—"}</dd>
          <dt className="text-torg-gray">Material</dt><dd className="font-medium">{p.material || "—"}</dd>
          <dt className="text-torg-gray">Comprimento</dt><dd className="font-medium">{p.comprimentoMm ? `${fmtN(p.comprimentoMm)} mm` : "—"}</dd>
          <dt className="text-torg-gray">Quantidade</dt><dd className="font-medium">{fmtN(p.qte)} un · {fmtKg(p.pesoTotalKg)}</dd>
          <dt className="text-torg-gray">Frente</dt><dd className="font-mono font-medium">{p.opNumero || "—"}</dd>
        </dl>
      </Bloco>)}

      {d.croquis?.length > 0 && (
        <Bloco titulo={`Croquis do conjunto (${d.croquis.length})`}>
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {d.croquis.map((c) => (
              <div key={c.marca} className="flex gap-2 text-[12px]">
                <span className="font-mono font-semibold min-w-[86px]">{c.marca}</span>
                <span className="text-torg-gray flex-1 truncate">{c.perfil || c.descricao || ""}</span>
                <span className="text-torg-gray tabular-nums">{fmtN(c.qtdNoConjunto)}×</span>
              </div>
            ))}
          </div>
        </Bloco>
      )}
      {d.conjuntos?.length > 0 && (
        <Bloco titulo="Faz parte de">
          <p className="font-mono text-[12.5px]">{d.conjuntos.map((c) => c.marca).join(", ")}</p>
        </Bloco>
      )}

      {/* ⚠⚠ UMA LINHA POR PERFIL, E O MOTIVO QUANDO NÃO HÁ R. Vitor (03/09/2026), na foto de um
          conjunto com a mesma cantoneira repetida onze vezes: "aqui não é real que está sem R, é?".
          Era real — só que por prazo de fornecedor, não por furo de rastreio. "Sem R" sozinho, em
          vermelho, acusa quem não tem culpa; agora a linha diz POR QUE não há R. */}
      <Bloco titulo="Rastreabilidade">
        {d.rastreio?.length ? d.rastreio.map((r, i) => {
          const mat = d.materialPorPerfil?.[r.perfil] || null;
          return (
            <div key={i} className="text-[12px] mb-1.5 last:mb-0">
              <span className="font-mono font-semibold">{r.perfil}</span>
              {r.posicoes > 1 && <span className="text-torg-gray-light ml-1">{r.posicoes}×</span>}
              {r.usadas?.length ? r.usadas.map((u, k) => (
                <span key={k} className="ml-2">
                  <span className="font-mono font-semibold text-emerald-700">R {u.r}</span>
                  {u.corrida && <span className="text-torg-gray"> · corrida {u.corrida}</span>}
                  {u.nf && <span className="text-torg-gray"> · NF {u.nf}</span>}
                  {u.indicado && <span className="text-torg-gray-light"> (indicado)</span>}
                </span>
              )) : (
                <span className="ml-2">
                  {mat?.estado === "ESTOQUE" && !mat.rInformado
                    ? <span className="text-amber-700">{mat.rotulo === "aguardando entrega" ? "aço a caminho — sem entrada no CMR ainda" : `de estoque · ${mat.rotulo || "sem o R informado"}`}</span>
                    : mat && mat.estado !== "NA_OP"
                    ? <span className="text-amber-700">{mat.rotulo || "material não comprado"}</span>
                    : <span className="text-red-600 italic">sem R</span>}
                </span>
              )}
              {mat?.descricaoCmr && <span className="block text-[11px] text-torg-gray-light truncate" title={mat.descricaoCmr}>{mat.descricaoCmr}</span>}
            </div>
          );
        }) : <p className="text-[12.5px] text-torg-gray italic">Sem rastreio ainda.</p>}
      </Bloco>

      <Bloco titulo="Produção registrada">
        {d.fabrica?.erro && <p role="alert" className="text-sm text-amber-800">{d.fabrica.erro}</p>}
        {d.fabrica?.fonte && <p className="text-xs text-torg-gray mb-2">{d.fabrica.fonte}{d.fabrica.atualizadoEm ? ` · sincronizado em ${new Date(d.fabrica.atualizadoEm).toLocaleString("pt-BR")}` : ""}</p>}
        <p className="text-xs text-torg-gray mb-2">Etapas com produção registrada não significam conclusão de toda a quantidade.</p>
        <div className="flex flex-wrap gap-1.5">
          {ETAPAS.map((s) => (
            <span key={s} className={`text-[11px] px-2 py-0.5 rounded border ${
              feitos.has(s) ? "border-amber-300 bg-amber-50 text-amber-800 font-semibold" : "border-gray-200 text-torg-gray"}`}>{s}</span>
          ))}
        </div>
        {d.fabrica?.trilha?.length ? (
          <p className="text-[11.5px] text-torg-gray mt-1.5">
            {d.fabrica.trilha.map((t) => `${t.setor} ${fmtN(t.un)} un · ${fmtKg(t.kg)} · ${fmtD(t.ultimo)}`).join(" · ")}
          </p>
        ) : !d.fabrica?.erro && <p className="text-[12px] text-torg-gray italic mt-1">Sem produção registrada para esta marca.</p>}
      </Bloco>

      {d.liberacoes?.length > 0 && (
        <Bloco titulo="Programação">
          {d.liberacoes.map((l, i) => (
            <p key={i} className="text-[12px]">
              <b>{fmtD(l.dia) || "sem dia"}</b> · {(l.setores || []).join(" / ")}
              {l.liberadoPor && <span className="text-torg-gray"> — liberado por {l.liberadoPor}</span>}
            </p>
          ))}
        </Bloco>
      )}

      <Bloco titulo="Qualidade">
        {d.relatorios?.length ? d.relatorios.map((r) => (
          <div key={r.codigo} className="flex gap-2 text-[12px]">
            <span className="font-mono font-semibold">{r.codigo}</span>
            <span className="text-torg-gray flex-1">{r.tipoRotulo}</span>
            <span className="text-torg-gray">{r.status}</span>
            {r.resultado && <span className={r.resultado === "APROVADO" ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{r.resultado}</span>}
          </div>
        )) : (
          <>
            <p className="text-[12.5px] text-torg-gray italic">Nenhum relatório emitido para esta marca.</p>
            <p className="text-[11.5px] text-torg-gray-light mt-1">Dimensional, visual de solda e ultrassom aparecem aqui quando o primeiro for emitido.</p>
          </>
        )}
      </Bloco>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div className="pt-2.5 border-t border-gray-100 first:border-t-0 first:pt-0">
      <p className="text-[10px] uppercase tracking-wider text-torg-gray font-semibold mb-1">{titulo}</p>
      {children}
    </div>
  );
}
