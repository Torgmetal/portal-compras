"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, Save, ExternalLink, AlertCircle, Check, Ruler, FileText, Lock, FolderOpen, Crop } from "lucide-react";
import { TIPO_LABEL } from "@/lib/qualidade-campo";
import MarcadorCotas from "./MarcadorCotas";
import RecorteDesenho from "./RecorteDesenho";
import FormEVS from "./FormEVS";
import FormUS from "./FormUS";
import FormPintura from "./FormPintura";
import FormLP from "./FormLP";
import Equipamentos from "./Equipamentos";
import AnexarProjeto from "./AnexarProjeto";
import EscolherProjeto from "./EscolherProjeto";
import Fotos from "./Fotos";
import { usaCotas } from "@/lib/qualidade-campo";

/**
 * O RELATÓRIO ABERTO — é aqui que o elaborador preenche e VÊ A PRÉVIA.
 *
 * Vitor (21/08/2026): "onde você está deixando a prévia desses relatórios?" — não havia. O motor
 * lia o desenho e montava as linhas, mas sem tela ninguém conferia antes de mandar assinar.
 *
 * A prévia é o PDF de verdade, no iframe ao lado: o mesmo arquivo que vai por e-mail ao assinante e
 * que entra no data book. Prévia que não é o documento final não serve para conferir.
 */

const RESULTADOS = ["APROVADO", "REPROVADO", "RETRABALHAR"];

export default function RelatorioDetalheClient({ id }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Vitor (21/08/2026): "na tela do gerador do projeto consegue trazer essa imagem do projeto para
  // ele conseguir conferir?" — o painel da direita abre NO DESENHO, que é o que ele olha enquanto
  const [marcaVista, setMarcaVista] = useState(null);
  // painel de escolha do projeto no servidor (pasta Montagem / Conjunto da Engenharia)
  const [escolhendo, setEscolhendo] = useState(false);
  // ⚠⚠ RECORTE MANUAL. Vitor (03/09/2026): "quero poder colocar o projeto dentro do relatório e
  // poder mover ele dentro para mostrar apenas o que eu selecionar" — troca o lugar da marcação de
  // cotas por este painel enquanto ajusta, porque os dois disputam o mesmo espaço e mexem na mesma
  // imagem (mudar o recorte com a marcação aberta ao lado só confundiria qual dos dois manda).
  const [ajustandoRecorte, setAjustandoRecorte] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setDados(j);
    } catch (e) { setErro(e.message); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div className="p-6"><p className="text-sm text-red-600 inline-flex items-center gap-2"><AlertCircle size={15} /> {erro}</p></div>;
  if (!dados) return <div className="p-6"><p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p></div>;

  const rel = dados.relatorio;
  const todas = Array.isArray(rel.linhas) ? rel.linhas : [];
  // ⚠ COTA GANHA DA LISTA. Assim que existe uma cota marcada no desenho, a tabela passa a ser só
  // dela — é o modelo do Vitor ("cota simples, referenciamos como A B C"), e conviver com as nove
  // linhas da lista de materiais era exatamente a poluição que ele pediu para tirar. As linhas
  // automáticas continuam gravadas; só saem de vista.
  const cotas = todas.filter((l) => l.letra);
  const linhas = cotas.length ? cotas : todas;
  const idxReal = (i) => (cotas.length ? todas.indexOf(cotas[i]) : i);
  const res = rel.resultados || {};
  const desenhos = Array.isArray(rel.desenhos) ? rel.desenhos : [];
  const marcaAtual = marcaVista || desenhos[0]?.marca || "";
  // enviado para assinatura = documento fechado (mesma regra da revisão do data book)
  const travado = !!rel.envioAssinaturaId;

  const setLinha = (i, campo, v) => {
    setDados((d) => {
      const ls = [...(d.relatorio.linhas || [])];
      ls[i] = { ...ls[i], [campo]: v };
      return { ...d, relatorio: { ...d.relatorio, linhas: ls } };
    });
  };
  const setCampo = (campo, v) => setDados((d) => ({ ...d, relatorio: { ...d.relatorio, [campo]: v } }));
  const setResultado = (campo, v) =>
    setDados((d) => ({ ...d, relatorio: { ...d.relatorio, resultados: { ...(d.relatorio.resultados || {}), [campo]: v } } }));

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: rel.titulo, observacoes: rel.observacoes, inspetor: rel.inspetor,
          linhas: rel.linhas, resultados: rel.resultados, equipamentos: rel.equipamentos,
          resultadoInspecao: rel.resultadoInspecao ?? null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1500px] mx-auto">
      <Link href="/qualidade/inspecoes" className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 mb-3"><ArrowLeft size={13} /> Inspeções</Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-torg-dark tracking-tight">
            <span className="font-mono">{rel.codigo}</span>
          </h1>
          <p className="text-[13px] text-torg-gray">
            OP-{rel.opNumero} · {TIPO_LABEL[rel.tipo] || rel.tipo}
            {rel.escopo === "AVULSAS" ? " · peças avulsas agrupadas" : rel.escopo === "CONJUNTO" ? " · conjunto" : ""}
            {Array.isArray(rel.marcas) && rel.marcas.length ? ` · ${rel.marcas.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {travado ? (
            <span className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 text-torg-gray inline-flex items-center gap-1.5">
              <Lock size={12} /> enviado para assinatura — somente leitura
            </span>
          ) : (
            <button onClick={salvar} disabled={salvando}
              className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
              {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
            </button>
          )}
          <a href={`/api/qualidade/inspecoes/${id}/pdf`} target="_blank" rel="noopener noreferrer"
            className="text-[12px] text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 font-medium">
            <ExternalLink size={13} /> Abrir PDF
          </a>
        </div>
      </div>

      {/* ── marcação das cotas: LARGURA INTEIRA ───────────────────────────────────────────────
          Vitor (21/08/2026): "tente aumentar a representatividade do desenho nessa seleção das
          cotas, precisa ficar dando zoom na tela". Estava preso na coluna do formulário, com menos
          de metade da página; aqui usa tudo, e ainda tem o "Ampliar" para a tela cheia. */}
      {usaCotas(rel.tipo) && !travado && (
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm mt-4">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <p className="text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5">
              <Ruler size={13} className="text-torg-blue" /> Cotas do desenho
            </p>
            {desenhos.length > 1 ? (
              // relatório de avulsas agrupadas tem um desenho por peça
              <select value={marcaAtual} onChange={(e) => setMarcaVista(e.target.value)}
                className="text-[11px] border border-gray-200 rounded-lg px-1.5 py-1 focus:border-torg-blue">
                {desenhos.map((d) => <option key={d.marca} value={d.marca}>{d.marca}</option>)}
              </select>
            ) : (
              <span className="text-[10px] text-torg-gray">
                {desenhos[0]?.nome || desenhos[0]?.marca || "nenhum projeto vinculado"}
                {desenhos[0]?.anexado && <span className="text-torg-blue"> · anexado</span>}
              </span>
            )}
            {/* ⚠ ESCOLHER vem antes de ANEXAR, e a ordem é a mensagem. O diagrama de montagem
                não tem marca de peça, então a varredura automática não o acha — mas ele ESTÁ no
                servidor, na pasta Montagem da Engenharia. Escolher aponta para o arquivo
                original; anexar cria uma cópia solta do controle de revisão da Engenharia, e
                serve só para o que realmente não está lá. */}
            {!travado && (
              <button onClick={() => setEscolhendo((v) => !v)}
                className="text-[11px] font-semibold text-white bg-torg-blue rounded-lg px-2 py-0.5 hover:opacity-90 inline-flex items-center gap-1">
                <FolderOpen size={11} /> escolher na pasta da obra
              </button>
            )}
            <AnexarProjeto relatorioId={id} anexado={!!desenhos[0]?.anexado} travado={travado}
              onMudou={carregar} />
            {/* ⚠⚠ RECORTE MANUAL. Vitor (03/09/2026): "quero poder colocar o projeto dentro do
                relatório e poder mover ele dentro para mostrar apenas o que eu selecionar" — o
                automático (recortarVista) erra em folha com várias vistas parecidas, como um
                diagrama de montagem. Este botão troca o quadro de cotas por um seletor da folha
                inteira, onde a pessoa arrasta o próprio retângulo. */}
            {!travado && desenhos.length > 0 && (
              <button onClick={() => setAjustandoRecorte((v) => !v)}
                className={`text-[11px] font-semibold rounded-lg px-2 py-0.5 inline-flex items-center gap-1 ${
                  ajustandoRecorte ? "bg-torg-orange text-white" : "text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50"}`}>
                <Crop size={11} /> {ajustandoRecorte ? "marcar cotas" : "ajustar recorte"}
              </button>
            )}
          </div>

          {escolhendo && (
            <EscolherProjeto relatorioId={id} onFechar={() => setEscolhendo(false)}
              onEscolhido={() => { setEscolhendo(false); carregar(); }} />
          )}

          {!desenhos.length && !escolhendo && (
            <p className="text-[11px] text-torg-gray">
              Nenhum projeto vinculado. O portal procura o desenho pela marca da peça; para
              conjunto ou diagrama de montagem, escolha na pasta da obra.
            </p>
          )}
          {desenhos.length > 0 && ajustandoRecorte && (
            <RecorteDesenho
              relatorioId={id}
              marca={marcaAtual}
              onSalvo={() => { setAjustandoRecorte(false); carregar(); }}
              onCancelar={() => setAjustandoRecorte(false)}
            />
          )}
          {desenhos.length > 0 && !ajustandoRecorte && (
          <MarcadorCotas
            relatorioId={id}
            marca={marcaAtual}
            cotas={cotas}
            onChange={(novas) => setDados((d) => ({
              ...d,
              // as automáticas ficam no fim, preservadas; as cotas assumem a frente
              relatorio: { ...d.relatorio, linhas: [...novas, ...(d.relatorio.linhas || []).filter((l) => !l.letra)] },
            }))}
            ocultos={res.ocultosDesenho || []}
            onOcultos={(o) => setResultado("ocultosDesenho", o)}
            linhasOcultas={res.linhasOcultasDesenho || []}
            onLinhas={(l) => setResultado("linhasOcultasDesenho", l)}
          />
          )}
        </div>
      )}

      {/* ── preenchimento ───────────────────────────────────────────────────────────────
          Vitor (21/08/2026): "pode tirar essa parte, não vamos mais precisar, pode deixar mais
          espaço para a seleção das cotas". O painel da direita (abas Desenho | Prévia) saiu: o
          desenho agora é o próprio quadro de marcação, e o PDF abre pelo botão do cabeçalho. */}
      {/* ── preenchimento da inspeção de pintura ─────────────────────────────────────────── */}
      {rel.tipo === "PINTURA" && (
        <div className="mt-4">
          <FormPintura rel={rel} res={res} travado={travado} setResultado={setResultado} />
        </div>
      )}

      {/* ── preenchimento do ensaio por ultrassom ────────────────────────────────────────── */}
      {rel.tipo === "ULTRASSOM" && (
        <div className="mt-4">
          <FormUS
            rel={rel} linhas={todas} res={res} travado={travado}
            setLinhas={(ls) => setDados((d) => ({ ...d, relatorio: { ...d.relatorio, linhas: ls } }))}
            setResultado={setResultado}
          />
        </div>
      )}

      {/* ── preenchimento do ensaio por líquido penetrante ───────────────────────────────── */}
      {rel.tipo === "LP" && (
        <div className="mt-4">
          <FormLP
            rel={rel} linhas={todas} res={res} travado={travado}
            setLinhas={(ls) => setDados((d) => ({ ...d, relatorio: { ...d.relatorio, linhas: ls } }))}
            setResultado={setResultado}
          />
        </div>
      )}

      {/* ── preenchimento do ensaio visual de solda ──────────────────────────────────────── */}
      {rel.tipo === "VISUAL_SOLDA" && (
        <div className="mt-4">
          <FormEVS
            rel={rel} linhas={todas} res={res} travado={travado}
            setLinhas={(ls) => setDados((d) => ({ ...d, relatorio: { ...d.relatorio, linhas: ls } }))}
            setResultado={setResultado}
          />
        </div>
      )}

      {/* ── fotos do ensaio — TODO tipo de relatório ─────────────────────────────────────── */}
      {/* Vitor (22/08): "posso colocar foto em qualquer relatório". Fica fora dos blocos por
          tipo de propósito: é o mesmo campo para os quatro. */}
      <div className="mt-4">
        <Fotos rel={rel} travado={travado} />
      </div>

      <div className="mt-4">
        <div className="space-y-3">
          {/* ⚠ SEM TÍTULO. Vitor (22/08/2026): "essa parte de título não há necessidade de ter em
              nenhum dos relatórios... seria um campo a mais para termos que pensar em preencher".
              O código (RLP-089-002) e o tipo já identificam o documento; o campo era espaço em
              branco pedindo para ser preenchido sem servir a nada. A coluna fica no banco: os
              relatórios que já têm título continuam mostrando o deles. */}
          <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm grid sm:grid-cols-2 gap-3">
            <Campo label="Inspetor" v={rel.inspetor || ""} onChange={(v) => setCampo("inspetor", v)} disabled={travado} />
            {/* ⚠ APROVAR TAMBÉM SE FAZ AQUI. Até agora só o celular gravava o resultado geral, e
                quem monta o relatório na mesa (LP, pintura) não tinha como fechá-lo — o documento
                ficava para sempre "aguardando aprovação". Aprovar guarda o PDF na pasta da obra. */}
            <label className="block">
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Resultado da inspeção</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[["APROVADO", "A", "aprovado", "bg-emerald-600 border-emerald-600"],
                  ["REPROVADO", "R", "reprovado", "bg-red-600 border-red-600"],
                  ["REC", "REC", "exame compl.", "bg-amber-500 border-amber-500"]].map(([v, sig, rot, cor]) => {
                  const on = rel.resultadoInspecao === v;
                  return (
                    <button key={v} disabled={travado} onClick={() => setCampo("resultadoInspecao", on ? null : v)}
                      className={`rounded-lg py-1.5 border leading-tight disabled:opacity-50 ${on ? `${cor} text-white` : "text-torg-dark border-gray-200 hover:bg-gray-50"}`}>
                      <span className="block text-[13px] font-bold">{sig}</span>
                      <span className={`block text-[9px] ${on ? "text-white/85" : "text-torg-gray"}`}>{rot}</span>
                    </button>
                  );
                })}
              </div>
              {rel.arquivadoEm && (
                <span className="block text-[10px] text-emerald-700 mt-1">PDF guardado na pasta da obra</span>
              )}
            </label>
          </div>



          {linhas.length > 0 && !["VISUAL_SOLDA", "ULTRASSOM", "PINTURA", "LP"].includes(rel.tipo) && (
            <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5"><Ruler size={13} className="text-torg-blue" /> Dimensões</p>
                {res.tolerancia && <span className="text-[10px] text-torg-gray">Tolerâncias conforme {res.tolerancia}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] text-torg-gray text-left">
                      <th className="pb-1 font-semibold">Peça</th>
                      <th className="pb-1 font-semibold">Descrição</th>
                      <th className="pb-1 font-semibold text-right">Projeto</th>
                      <th className="pb-1 font-semibold text-right">Encontrado</th>
                      <th className="pb-1 font-semibold">Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => {
                      const dif = l.encontradoMm != null && l.projetoMm != null ? Number(l.encontradoMm) - Number(l.projetoMm) : null;
                      return (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="py-1 font-medium text-torg-dark whitespace-nowrap">{l.marca}</td>
                          <td className="py-1 text-torg-gray">{l.descricao || "—"}</td>
                          <td className="py-1 text-right font-mono text-torg-dark">{l.projetoMm ?? "—"}</td>
                          <td className="py-1 text-right">
                            {/* 🚫 nasce vazio: Vitor pediu que a dimensão encontrada seja do elaborador */}
                            <input type="number" step="0.1" disabled={travado}
                              value={l.encontradoMm ?? ""} onChange={(e) => setLinha(idxReal(i), "encontradoMm", e.target.value === "" ? null : Number(e.target.value))}
                              className="w-20 text-right text-[12px] font-mono border border-gray-200 rounded px-1.5 py-0.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
                            {dif != null && dif !== 0 && (
                              <span className={`ml-1 text-[10px] font-semibold ${Math.abs(dif) > 3 ? "text-red-600" : "text-amber-600"}`}>
                                {dif > 0 ? "+" : ""}{Math.round(dif * 10) / 10}
                              </span>
                            )}
                          </td>
                          <td className="py-1">
                            <input value={l.obs || ""} disabled={travado} onChange={(e) => setLinha(idxReal(i), "obs", e.target.value)}
                              className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-0.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {[["dimensional", "Dimensional"], ["alinhamento", "Alinhamento"], ["acabamento", "Acabamento"], ["resultado", "Resultado"]].map(([k, rot]) => (
                  <label key={k} className="block">
                    <span className="block text-[9px] font-semibold text-torg-gray mb-0.5 uppercase">{rot}</span>
                    <select value={res[k] || ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value || null)}
                      className="w-full text-[12px] border border-gray-200 rounded-lg px-1.5 py-1 focus:border-torg-blue disabled:bg-gray-50">
                      <option value="">a preencher</option>
                      {(k === "resultado" ? RESULTADOS : RESULTADOS.slice(0, 2)).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
            <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Comentários</span>
            <textarea rows={3} value={rel.observacoes || ""} disabled={travado} onChange={(e) => setCampo("observacoes", e.target.value)}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
          </div>

          {/* ⚠ TODO TIPO DE RELATÓRIO ESCOLHE INSTRUMENTO. Fica fora dos blocos por tipo: os
              cinco modelos têm o quadro "Instrumentos utilizados" na folha, e até aqui só o
              celular sabia preenchê-lo. */}
          <Equipamentos
            escolhidos={Array.isArray(rel.equipamentos) ? rel.equipamentos : []}
            travado={travado}
            tipo={rel.tipo}
            onMudar={(eqs) => setDados((d) => ({ ...d, relatorio: { ...d.relatorio, equipamentos: eqs } }))}
          />

          {dados.assinaturas?.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <p className="text-[12px] font-bold text-torg-dark mb-1.5">Assinaturas</p>
              {dados.assinaturas.map((a) => (
                <p key={a.email} className="text-[11px] text-torg-gray inline-flex items-center gap-1 mr-3">
                  {a.assinadoEm ? <Check size={11} className="text-emerald-600" /> : null}
                  {a.nome}{a.setor ? ` · ${a.setor}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function Campo({ label, v, onChange, disabled }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{label}</span>
      <input value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
    </label>
  );
}
