"use client";
import { useEffect, useState, useRef } from "react";
import { Loader2, AlertCircle, Check, Save, Ruler, Plus, QrCode, Trash2, Camera, X } from "lucide-react";
import LeitorQR from "./LeitorQR";
import { marcaDoQR, TIPOS_RELATORIO } from "@/lib/qualidade-campo";
import { DESCONTINUIDADES, LAUDOS, laudoSugerido, LUX_MINIMO, TECNICAS, CONDICOES, METAIS_BASE, TIPOS_PECA } from "@/lib/evs-campos";
import { criteriosDoDefeito, ONDE_VALE } from "@/lib/aws-d11";
import { RESULTADO_LABEL } from "@/lib/revisao-inspecao";
import {
  APARELHOS, CABECOTES, ANGULOS, ACOPLANTES, BLOCOS_PADRAO, FACES,
  TIPOS_CARREGAMENTO, classificacaoIndicacao, TABELA_ACEITACAO_DISPONIVEL,
} from "@/lib/us-campos";

/**
 * O INSPETOR DE CAMPO MEDINDO, NO CELULAR.
 *
 * Vitor (21/08/2026): "não estou conseguindo acessar os relatórios na tela do inspetor de campo".
 * Não dava mesmo — o portal de campo só fazia captura de foto. Este é o caminho que faltava.
 *
 * O desenho é o que ele descreveu: alguém monta o relatório no computador (cotas, tolerâncias,
 * cabeçalho) e o inspetor, no chão de fábrica, **só informa o que mediu**. Dimensão de projeto e
 * tolerância chegam prontas e aparecem ao lado — mas não se editam aqui.
 *
 * ⚠ TELA DE CHÃO DE FÁBRICA: alvo grande, teclado numérico, uma coisa por vez. Quem usa está de
 * luva, com o celular numa mão e o instrumento na outra.
 */
export default function Medir({ op, onSair, Tela, Equipamentos }) {
  const [lista, setLista] = useState(null);
  const [abertoId, setAbertoId] = useState(null);

  useEffect(() => {
    if (abertoId) return;
    setLista(null);
    fetch(`/api/campo/relatorios?opNumero=${encodeURIComponent(op.numero)}`)
      .then((r) => r.json()).then((j) => setLista(j.relatorios || [])).catch(() => setLista([]));
  }, [op.numero, abertoId]);

  if (abertoId) {
    return <Preencher id={abertoId} op={op} onVoltar={() => setAbertoId(null)} Tela={Tela} Equipamentos={Equipamentos} />;
  }

  return (
    <Tela titulo={`OP-${op.numero}`} sub="Relatórios para medir" voltar={onSair}>
      {lista === null && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> buscando…</p>}
      {lista && !lista.length && (
        <p className="text-sm text-torg-gray">
          Nenhum relatório aberto nesta OP. Eles são criados no computador, pela Qualidade.
        </p>
      )}
      {/* ── AGRUPADO POR TIPO ────────────────────────────────────────────────────────────────
          Vitor (21/08/2026): "nessa página onde o inspetor entra, deixa organizado essas áreas por
          tipo de relatórios". Numa OP com dezenas de relatórios abertos, a lista corrida obriga a
          ler código por código para achar o dimensional no meio dos de solda.

          ⚠ A ordem é a de TIPOS_RELATORIO, não alfabética: é a ordem em que a inspeção acontece
          (dimensional → solda → ensaio → pintura), a mesma do data book e a mesma da tela do
          computador. Duas ordens para a mesma lista confundem quem usa as duas. */}
      {agruparPorTipo(lista || []).map((g) => (
        <div key={g.tipo} className="mb-4">
          <div className="flex items-baseline gap-2 mb-1.5 px-0.5">
            <h3 className="text-[13px] font-bold text-torg-dark">{g.label}</h3>
            <span className="text-[12px] text-torg-gray">{g.itens.length}</span>
          </div>
          <div className="space-y-2">
            {g.itens.map((r) => (
              <button key={r.id} onClick={() => setAbertoId(r.id)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 active:bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-torg-blue text-[15px]">{r.codigo}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {r.revisao > 0 && <span className="text-[11px] font-mono font-bold text-torg-gray">{r.rotuloRevisao}</span>}
                    {r.resultadoInspecao === "REPROVADO"
                      ? <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">reprovado</span>
                      : r.resultadoInspecao === "REC"
                      ? <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">exame compl.</span>
                      : r.resultadoInspecao === "APROVADO"
                      ? <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Check size={11} /> aprovado</span>
                      : r.completo
                      ? <span className="text-[11px] font-semibold text-torg-blue bg-torg-blue/10 border border-torg-blue-200 rounded-full px-2 py-0.5">medido</span>
                      : <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{r.medidas}/{r.aMedir}</span>}
                  </span>
                </div>
                {r.marcas?.length > 0 && <p className="text-[13px] text-torg-dark font-mono mt-0.5">{r.marcas.join(", ")}</p>}
                {r.titulo && <p className="text-[12px] text-torg-gray">{r.titulo}</p>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Tela>
  );
}

/** Campo de seleção grande, para o dedo. */
function Sel({ rot, v, opcoes, onMudar, destaque = false }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
      <select value={v || ""} onChange={(e) => onMudar(e.target.value)}
        className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none ${
          destaque ? "border-amber-300 bg-amber-50" : "border-gray-200 focus:border-torg-blue"}`}>
        <option value="">—</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Txt({ rot, v, onMudar, tipo = "text" }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
      <input type={tipo} inputMode={tipo === "number" ? "decimal" : undefined} value={v ?? ""}
        onChange={(e) => onMudar(e.target.value)}
        className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 outline-none focus:border-torg-blue" />
    </label>
  );
}

/**
 * Uma indicação de ultrassom.
 *
 * ⚠ O "c" e o "d" são CALCULADOS na hora, conforme os itens 15.3 e 15.4 do PI-QUA-003. O inspetor
 * informa o ganho da indicação (a), o de referência (b) e o percurso sônico; o resto é conta — e
 * conta feita à mão em polegada, no chão de fábrica, é onde se erra.
 *
 * ⚠ O portal NÃO diz se passa. As tabelas 2 e 3 do procedimento estão como imagem no PDF e ainda
 * não foram cadastradas; dizer "aprovado" a partir de uma tabela que não tenho seria a pior forma
 * de errar aqui. Mostra o "d" e o laudo é do inspetor.
 */
function IndicacaoUS({ l, set }) {
  const { c, d } = classificacaoIndicacao({ a: l.db_indicacao, b: l.db_referencia, percursoMm: l.percurso });
  const num = (campo, rot) => (
    <label className="block">
      <span className="block text-[11px] text-torg-gray mb-0.5">{rot}</span>
      <input type="number" inputMode="decimal" value={l[campo] ?? ""} onChange={(e) => set(campo, e.target.value)}
        className="w-full text-[15px] border-2 border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-torg-blue" />
    </label>
  );
  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {num("indicacao", "Nº indicação")}
        <label className="block">
          <span className="block text-[11px] text-torg-gray mb-0.5">Ângulo</span>
          <select value={l.angulo || ""} onChange={(e) => set("angulo", e.target.value)}
            className="w-full text-[15px] border-2 border-gray-200 rounded-lg px-2 py-2 outline-none">
            <option value="">—</option>
            {ANGULOS.map((a) => <option key={a} value={a}>{a}°</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-torg-gray mb-0.5">Face</span>
          <select value={l.face || ""} onChange={(e) => set("face", e.target.value)}
            className="w-full text-[15px] border-2 border-gray-200 rounded-lg px-2 py-2 outline-none">
            <option value="">—</option>
            {FACES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {num("db_indicacao", "a — indicação (dB)")}
        {num("db_referencia", "b — referência (dB)")}
        {num("percurso", "Percurso sônico (mm)")}
      </div>

      {/* ⚠ o resultado da conta fica À VISTA, com a fórmula: é ele que se compara com a tabela */}
      <div className="rounded-lg bg-torg-blue/5 border border-torg-blue-200 px-2.5 py-2">
        <p className="text-[12px] text-torg-dark">
          <strong>c</strong> = {c ?? "—"} dB &nbsp;·&nbsp; <strong>d</strong> = <strong className="text-[15px]">{d ?? "—"}</strong> dB
        </p>
        <p className="text-[10px] text-torg-gray">d = a − b − c (PI-QUA-003, itens 15.3 e 15.4)</p>
        {!TABELA_ACEITACAO_DISPONIVEL && (
          <p className="text-[10px] text-amber-700 mt-0.5">Compare com a tabela do procedimento — o portal ainda não a tem cadastrada.</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {num("comprimento", "Compr. reprovado (mm)")}
        {num("profundidade", "Profund. face A (mm)")}
        {num("nivel", "Nível de defeito")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {num("dist_x", "Distância X (mm)")}
        {num("dist_y", "Distância Y (mm)")}
      </div>
    </div>
  );
}

/** Agrupa os relatórios por tipo, na ordem em que a inspeção acontece. */
function agruparPorTipo(lista) {
  const porTipo = new Map();
  for (const r of lista) {
    const g = porTipo.get(r.tipo) || { tipo: r.tipo, label: r.tipoLabel || r.tipo, itens: [] };
    g.itens.push(r);
    porTipo.set(r.tipo, g);
  }
  const ordem = TIPOS_RELATORIO.map((t) => t.id);
  return [...porTipo.values()].sort((a, b) => {
    const ia = ordem.indexOf(a.tipo), ib = ordem.indexOf(b.tipo);
    // tipo desconhecido, vindo de dado antigo, vai para o fim em vez de sumir
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function Preencher({ id, op, onVoltar, Tela, Equipamentos }) {
  const [rel, setRel] = useState(null);
  const [erro, setErro] = useState("");
  const [linhas, setLinhas] = useState([]);
  const [equipamentos, setEquipamentos] = useState([]);
  // ⚠ AS CONDIÇÕES DO ENSAIO SÃO DO CAMPO. Vitor (21/08/2026): "você só trouxe a medida do
  // luxímetro e o restante precisa ser preenchido também". Está certo — técnica, condições
  // superficiais e metal base são OBSERVADOS na hora, com a peça na frente. Quem monta o relatório
  // no computador não tem como saber se a junta foi escovada ou está como soldada.
  const [cond, setCond] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);
  // soldadores e EPS vêm juntos: são pedidos na mesma tela, e duas chamadas na fábrica é uma a mais
  const [listas, setListas] = useState({ soldadores: [], eps: [] });
  const [lendoQR, setLendoQR] = useState(false);
  // ⚠ a foto é OPCIONAL nestes relatórios, mas quando existe é evidência: uma junta reprovada com
  // foto vale muito mais na conversa com o cliente do que a mesma junta descrita em texto.
  const [fotos, setFotos] = useState([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    fetch(`/api/campo/relatorios/${id}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then((j) => {
        setRel(j.relatorio);
        setResultado(j.relatorio.resultadoInspecao || null);
        setLinhas(Array.isArray(j.relatorio.linhas) ? j.relatorio.linhas : []);
        setEquipamentos(Array.isArray(j.relatorio.equipamentos) ? j.relatorio.equipamentos : []);
        const r0 = j.relatorio.resultados || {};
        setCond({
          iluminacao: r0.iluminacao ?? "", tecnica: r0.tecnica || "", condicoes: r0.condicoes || "",
          metalBase: r0.metalBase || "", tipoPeca: r0.tipoPeca || "",
          carregamento: r0.carregamento || "", apModelo: r0.apModelo || "", apSerie: r0.apSerie || "",
          cbModelo: r0.cbModelo || "", cbSerie: r0.cbSerie || "", cbAngulo: r0.cbAngulo || "",
          acoplante: r0.acoplante || "", blocoPadrao: r0.blocoPadrao || "",
          ganhoVarredura: r0.ganhoVarredura || "", local: r0.local || "",
        });
      })
      .catch((e) => setErro(e.message));
  }, [id]);

  useEffect(() => {
    // as fotos que já estão amarradas a este relatório
    fetch(`/api/campo/foto?relatorioId=${id}`).then((r) => r.json())
      .then((j) => setFotos(j.fotos || [])).catch(() => {});
  }, [id]);

  useEffect(() => {
    fetch("/api/qualidade/soldagem").then((r) => r.json())
      .then((j) => setListas({ soldadores: j.soldadores || [], eps: j.eps || [] })).catch(() => {});
  }, []);

  if (erro) return <Tela titulo="Relatório" voltar={onVoltar}><p className="text-sm text-red-600 inline-flex items-center gap-2"><AlertCircle size={15} /> {erro}</p></Tela>;
  if (!rel) return <Tela titulo="Relatório" voltar={onVoltar}><p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> abrindo…</p></Tela>;

  const ehDim = rel.tipo === "DIMENSIONAL";
  const ehUS = rel.tipo === "ULTRASSOM";
  const set = (i, campo, v) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  function alternarDefeito(i, cod) {
    const atuais = String(linhas[i]?.descontinuidade || "").split(/[\s,;]+/).filter(Boolean);
    const novos = atuais.includes(cod) ? atuais.filter((c) => c !== cod) : [...atuais, cod];
    const sug = laudoSugerido(novos);
    setLinhas((p) => p.map((l, k) => (k === i ? { ...l, descontinuidade: novos.join(" "), laudo: sug || (novos.length ? l.laudo : "A") } : l)));
  }

  /**
   * Acrescenta uma junta.
   *
   * ⚠ A JUNTA NASCE NO CAMPO, não no computador. Vitor (21/08/2026): "ter a opção de ler o QR code
   * ou digitar qual o número da peça". No dimensional as cotas são definidas antes, porque saem do
   * desenho; na solda, quem descobre que existe uma junta a inspecionar é quem está na frente dela.
   */
  function novaJunta(marca) {
    const m = String(marca || "").trim().toUpperCase();
    if (!m) return;
    setLinhas((p) => [...p, { marca: m, qtd: 1, descricao: "", eps: "", soldador: "", descontinuidade: "", laudo: "" }]);
  }

  function aoLerQR(texto) {
    const m = marcaDoQR(texto);
    setLendoQR(false);
    if (!m) { alert("Não reconheci a marca neste QR."); return; }
    novaJunta(m);
  }

  async function receberFotos(e) {
    const arquivos = [...(e.target.files || [])];
    e.target.value = "";
    if (!arquivos.length) return;
    setEnviandoFoto(true);
    try {
      for (const arq of arquivos) {
        const fd = new FormData();
        fd.append("file", arq);
        fd.append("opNumero", op.numero);
        fd.append("tipo", rel.tipo);
        fd.append("relatorioId", id);
        const r = await fetch("/api/campo/foto", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Erro ao enviar");
        setFotos((p) => [...p, j.foto || j]);
      }
    } catch (err) { alert(err.message); } finally { setEnviandoFoto(false); }
  }

  async function apagarFoto(idFoto) {
    if (!confirm("Apagar esta foto?")) return;
    try {
      const r = await fetch(`/api/campo/foto?id=${idFoto}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Erro");
      setFotos((p) => p.filter((f) => f.id !== idFoto));
    } catch (e) { alert(e.message); }
  }

  async function reinspecionar() {
    if (!confirm(`Abrir a próxima revisão?\n\nAs medidas de ${rel.rotuloRevisao} ficam guardadas e os campos voltam em branco para medir de novo.`)) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/campo/relatorios/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reinspecionar: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      alert(`Reinspeção aberta: ${j.rotulo}.`);
      onVoltar();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  async function salvar() {
    setSalvando(true);
    try {
      // ⚠ manda só o que o campo pode escrever, com o ÍNDICE da linha — o servidor mescla. Mandar a
      // lista inteira apagaria a cota que a Qualidade acrescentou enquanto o celular estava no bolso.
      const medidas = linhas.map((l, i) => ({
        i,
        ...(ehDim
          ? { encontradoMm: l.encontradoMm }
          : ehUS
          ? {
              laudo: l.laudo, marca: l.marca, indicacao: l.indicacao, angulo: l.angulo, face: l.face,
              comprimento: l.comprimento, db_indicacao: l.db_indicacao, db_referencia: l.db_referencia,
              db_atenuacao: l.db_atenuacao, db_classe: l.db_classe, percurso: l.percurso,
              reprovado: l.reprovado, profundidade: l.profundidade, dist_x: l.dist_x, dist_y: l.dist_y,
              soldador: l.soldador, sinete: l.sinete, nivel: l.nivel,
            }
          : { laudo: l.laudo, descontinuidade: l.descontinuidade, marca: l.marca, qtd: l.qtd,
              descricao: l.descricao, eps: l.eps, soldador: l.soldador, sinete: l.sinete }),
        obs: l.obs ?? null,
      }));
      const r = await fetch(`/api/campo/relatorios/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medidas, equipamentos, assumirInspetor: !rel.inspetor, condicoes: ehDim ? undefined : cond, resultadoInspecao: resultado }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      alert("Medidas gravadas.");
      onVoltar();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  const lux = Number(cond.iluminacao);
  const luxBaixo = Number.isFinite(lux) && lux > 0 && lux < LUX_MINIMO;
  const medir = linhas.filter((l) => l.letra || l.marca);

  return (
    <Tela titulo={rel.codigo} sub={`${rel.tipoLabel} · ${rel.rotuloRevisao}`} voltar={onVoltar}>
      {/* ⚠ reprovado NÃO se regrava por cima: abre a próxima revisão. O que se mediu antes do
          reparo é evidência — é ela que mostra que a peça foi reprovada, reparada e reinspecionada. */}
      {(rel.resultadoInspecao === "REPROVADO" || rel.resultadoInspecao === "REC") && (
        <div className="mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <p className="text-[13px] font-semibold text-amber-900">
            {rel.rotuloRevisao} {rel.resultadoInspecao === "REPROVADO" ? "reprovada" : "com exame complementar"}
          </p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            Para reinspecionar após o reparo, abra a próxima revisão. As medidas anteriores ficam guardadas.
          </p>
          <button onClick={reinspecionar} disabled={salvando}
            className="mt-2 w-full bg-amber-600 text-white active:bg-amber-700 rounded-xl py-3 text-[15px] font-semibold disabled:opacity-60">
            Abrir reinspeção
          </button>
        </div>
      )}

      <Equipamentos escolhidos={equipamentos} onMudar={setEquipamentos} />

      {ehUS && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[12px] font-semibold text-torg-gray">Aparelhagem e ensaio</p>
          <p className="text-[11px] text-torg-gray -mt-1.5">
            Uma vez por ensaio — é a mesma aparelhagem a manhã inteira.
          </p>

          {/* ⚠ OBRIGATÓRIO aqui, ao contrário do visual de solda: o item 18.1 do PI-QUA-003 exige o
              tipo de estrutura no conteúdo mínimo do relatório, e o critério muda com ele (15.6
              estática, 15.7 dinâmica). */}
          <Sel rot="Tipo de estrutura (PI-QUA-003)" v={cond.carregamento} opcoes={TIPOS_CARREGAMENTO.map((t) => t.nome)}
            onMudar={(v) => setCond((c) => ({ ...c, carregamento: v }))} destaque={!cond.carregamento} />

          <Sel rot="Aparelho" v={cond.apModelo} opcoes={APARELHOS} onMudar={(v) => setCond((c) => ({ ...c, apModelo: v }))} />
          <Txt rot="Nº de série do aparelho" v={cond.apSerie} onMudar={(v) => setCond((c) => ({ ...c, apSerie: v }))} />

          <Sel rot="Cabeçote" v={cond.cbModelo}
            opcoes={CABECOTES.map((c) => `${c.modelo}${c.angulo ? ` · ${c.angulo}°` : ""} · ${c.mhz} MHz`)}
            onMudar={(v) => setCond((c) => ({ ...c, cbModelo: v }))} />
          <Txt rot="Nº de série do cabeçote" v={cond.cbSerie} onMudar={(v) => setCond((c) => ({ ...c, cbSerie: v }))} />
          <Txt rot="Ângulo real (graus)" v={cond.cbAngulo} tipo="number" onMudar={(v) => setCond((c) => ({ ...c, cbAngulo: v }))} />

          <Sel rot="Acoplante" v={cond.acoplante} opcoes={ACOPLANTES} onMudar={(v) => setCond((c) => ({ ...c, acoplante: v }))} />
          <Sel rot="Bloco padrão" v={cond.blocoPadrao} opcoes={BLOCOS_PADRAO} onMudar={(v) => setCond((c) => ({ ...c, blocoPadrao: v }))} />
          <Txt rot="Ganho de varredura (dB)" v={cond.ganhoVarredura} tipo="number" onMudar={(v) => setCond((c) => ({ ...c, ganhoVarredura: v }))} />
          <Txt rot="Local de ensaio" v={cond.local} onMudar={(v) => setCond((c) => ({ ...c, local: v }))} />
        </div>
      )}

      {!ehDim && !ehUS && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[12px] font-semibold text-torg-gray">Condições do ensaio</p>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Iluminação medida (lux) · mínimo {LUX_MINIMO}</span>
            <input type="number" inputMode="numeric" value={cond.iluminacao ?? ""}
              onChange={(e) => setCond((c) => ({ ...c, iluminacao: e.target.value }))}
              className={`w-full text-lg border-2 rounded-xl px-3 py-3 outline-none ${luxBaixo ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-torg-blue"}`} />
            {luxBaixo && <span className="text-[12px] text-red-600 inline-flex items-center gap-1 mt-1"><AlertCircle size={12} /> abaixo do mínimo do PO-06</span>}
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Técnica de inspeção</span>
            <select value={cond.tecnica || ""} onChange={(e) => setCond((c) => ({ ...c, tecnica: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {TECNICAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Condições superficiais</span>
            <select value={cond.condicoes || ""} onChange={(e) => setCond((c) => ({ ...c, condicoes: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {CONDICOES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Tipo de estrutura</span>
            <select value={cond.tipoPeca || ""} onChange={(e) => setCond((c) => ({ ...c, tipoPeca: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {TIPOS_PECA.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12px] text-torg-gray mb-1">Metal base</span>
            <select value={cond.metalBase || ""} onChange={(e) => setCond((c) => ({ ...c, metalBase: e.target.value }))}
              className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
              <option value="">—</option>
              {METAIS_BASE.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

        </div>
      )}

      <p className="text-[12px] font-semibold text-torg-gray mt-4 mb-1.5 inline-flex items-center gap-1.5">
        <Ruler size={13} className="text-torg-blue" /> {ehDim ? "Cotas a medir" : "Juntas a inspecionar"} · {medir.length}
      </p>

      <div className="space-y-2.5">
        {linhas.map((l, i) => {
          if (!l.letra && !l.marca) return null;
          const marcados = String(l.descontinuidade || "").split(/[\s,;]+/).filter(Boolean);
          const dif = ehDim && l.encontradoMm != null && l.projetoMm != null ? Number(l.encontradoMm) - Number(l.projetoMm) : null;
          const tol = parseFloat(String(l.tolerancia || "").replace(/[^\d.,]/g, "").replace(",", "."));
          const fora = dif != null && Number.isFinite(tol) && Math.abs(dif) > tol;
          return (
            <div key={i} className={`bg-white rounded-xl p-3 border ${l.reprovouAntes ? "border-2 border-amber-400" : "border-gray-200"}`}>
              {l.reprovouAntes && (
                <p className="text-[11px] font-semibold text-amber-800 mb-1">reprovado na revisão anterior</p>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-torg-dark text-[15px]">{l.marca}{l.descricao ? ` · ${l.descricao}` : ""}</span>
                {!ehDim && (
                  <button onClick={() => setLinhas((p) => p.filter((_, k) => k !== i))} className="text-torg-gray active:text-red-600 shrink-0">
                    <Trash2 size={15} />
                  </button>
                )}
                {ehDim && <span className="text-[13px] text-torg-gray">projeto <strong className="text-torg-dark font-mono">{l.projetoMm ?? "—"}</strong> {l.tolerancia || ""}</span>}
              </div>

              {ehUS ? (
                <IndicacaoUS l={l} set={(campo, v) => set(i, campo, v)} />
              ) : ehDim ? (
                <div className="mt-2">
                  <input type="number" inputMode="decimal" value={l.encontradoMm ?? ""}
                    onChange={(e) => set(i, "encontradoMm", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="medida encontrada"
                    className={`w-full text-2xl font-mono text-center border-2 rounded-xl py-3 outline-none ${
                      fora ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 focus:border-torg-blue"}`} />
                  {dif != null && (
                    <p className={`text-center text-[13px] mt-1 font-semibold ${fora ? "text-red-600" : "text-emerald-700"}`}>
                      {dif > 0 ? "+" : ""}{Math.round(dif * 10) / 10} mm {fora ? "· fora da tolerância" : "· dentro"}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[11px] text-torg-gray mb-0.5">Soldador</span>
                      {/* ⚠ escolher o soldador grava também o SINETE (S-01, S-04…), que é o que
                          identifica quem soldou a junta no relatório de ultrassom. Ele vem da RSQ e
                          não existe em nenhum outro cadastro do portal. */}
                      <select value={l.soldador || ""}
                        onChange={(e) => {
                          const x = listas.soldadores.find((y) => y.nome === e.target.value);
                          // ⚠ qualificado num processo só? a EPS se preenche. Em dois (GMAW e FCAW),
                          // a escolha é dele — o portal não tem como saber qual junta é qual.
                          const unica = x?.epsPermitidas?.length === 1 ? x.epsPermitidas[0] : null;
                          setLinhas((p2) => p2.map((ln, k) => (k === i ? {
                            ...ln, soldador: e.target.value, sinete: x?.sinete || null,
                            eps: unica || (x?.epsPermitidas?.includes(ln.eps) ? ln.eps : ""),
                          } : ln)));
                        }}
                        className={`w-full text-[14px] border-2 rounded-lg px-2 py-2 outline-none ${
                          listas.soldadores.find((x) => x.nome === l.soldador)?.qualificado === false ? "border-amber-400 bg-amber-50" : "border-gray-200"}`}>
                        <option value="">—</option>
                        {listas.soldadores.map((x) => (
                          <option key={x.id} value={x.nome}>
                            {x.sinete ? `${x.sinete} · ` : ""}{x.nome}{x.qualificado ? "" : " — sem qualificação"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-torg-gray mb-0.5">EPS</span>
                      <select value={l.eps || ""} onChange={(e) => set(i, "eps", e.target.value)}
                        className="w-full text-[14px] border-2 border-gray-200 rounded-lg px-2 py-2 outline-none">
                        <option value="">—</option>
                        {(() => {
                          // ⚠ só as EPS do processo que o soldador cobre. Escolher uma fora disso é
                          // junta soldada sob procedimento que ele não tem qualificação para usar.
                          const permitidas = listas.soldadores.find((y) => y.nome === l.soldador)?.epsPermitidas;
                          const lst = permitidas?.length ? listas.eps.filter((x) => permitidas.includes(x.codigo)) : listas.eps;
                          return lst.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo}{x.processo ? ` · ${x.processo}` : ""}</option>);
                        })()}
                      </select>
                    </label>
                  </div>

                  {/* ⚠ CÓDIGO E NOME NO BOTÃO. Vitor (21/08/2026): "tem como colocar as legendas de
                      cada botão desse?". Só a sigla obriga a decorar onze códigos ou a procurar a
                      legenda no rodapé do formulário — e quem está de luva, com a peça na frente,
                      não faz nem uma coisa nem outra: erra o botão. */}
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {DESCONTINUIDADES.map((d) => {
                      const on = marcados.includes(d.c);
                      return (
                        <button key={d.c} onClick={() => alternarDefeito(i, d.c)}
                          className={`text-left rounded-lg px-2 py-1.5 border leading-tight ${
                            on ? (d.grave ? "bg-red-600 text-white border-red-600" : "bg-torg-orange text-white border-torg-orange")
                               : "text-torg-dark border-gray-200 active:bg-gray-50"}`}>
                          <span className="block text-[13px] font-bold">{d.c}</span>
                          <span className={`block text-[10px] ${on ? "text-white/85" : "text-torg-gray"}`}>{d.nome}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* o critério do defeito, para julgar com a regra à vista */}
                  {marcados.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {marcados.map((c) => {
                        const d = DESCONTINUIDADES.find((x) => x.c === c);
                        const crit = criteriosDoDefeito(c);
                        return (
                          <div key={c} className="text-[12px] leading-snug">
                            <span className="font-semibold text-torg-dark">{c} · {d?.nome}</span>
                            {d?.grave && <span className="text-red-600 font-semibold"> — sem tolerância</span>}
                            {crit.map((k) => (
                              <p key={`${k.n}${k.letra || ""}`} className="text-torg-gray pl-2 border-l-2 border-gray-200 mt-0.5">
                                {k.aplica.length < 3 && <strong>{ONDE_VALE(k)}: </strong>}{k.texto}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {LAUDOS.map((v) => {
                      const on = l.laudo === v.c;
                      const cor = v.c === "A" ? "bg-emerald-600 border-emerald-600" : v.c === "R" ? "bg-red-600 border-red-600" : "bg-amber-500 border-amber-500";
                      return (
                        <button key={v.c} onClick={() => set(i, "laudo", v.c)}
                          className={`rounded-lg py-2 border leading-tight ${on ? `${cor} text-white` : "text-torg-dark border-gray-200 active:bg-gray-50"}`}>
                          <span className="block text-[15px] font-bold">{v.c}</span>
                          <span className={`block text-[10px] ${on ? "text-white/85" : "text-torg-gray"}`}>{v.curto}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <input value={l.obs || ""} onChange={(e) => set(i, "obs", e.target.value)} placeholder="observação (opcional)"
                className="mt-2 w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-torg-blue" />
            </div>
          );
        })}
      </div>

      {ehUS && (
        <p className="text-[12px] text-torg-gray mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          Registre apenas as descontinuidades <strong>reprovadas</strong> (PI-QUA-003, item 15.1).
          Em solda crítica à fratura, também as até 6 dB abaixo do nível de rejeição.
        </p>
      )}

      {!ehDim && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => setLendoQR(true)}
            className="bg-white border-2 border-torg-blue text-torg-blue active:bg-torg-blue/5 rounded-xl py-3.5 text-[15px] font-semibold inline-flex items-center justify-center gap-2">
            <QrCode size={19} /> Ler QR
          </button>
          <button onClick={() => { const m = prompt("Número da peça:"); if (m) novaJunta(m); }}
            className="bg-white border border-gray-300 text-torg-dark active:bg-gray-50 rounded-xl py-3.5 text-[15px] font-semibold inline-flex items-center justify-center gap-2">
            <Plus size={19} /> Digitar
          </button>
        </div>
      )}

      {lendoQR && <LeitorQR onLer={aoLerQR} onFechar={() => setLendoQR(false)} />}

      {!medir.length && (
        <p className="text-sm text-torg-gray">
          Este relatório ainda não tem {ehDim ? "cotas marcadas" : "juntas lançadas"}. Quem monta faz isso no computador.
        </p>
      )}

      {/* ── FOTOS (opcionais) ───────────────────────────────────────────────────────────────
          Vitor (21/08/2026): "falta o botão para tirar foto no relatório". A foto nasce já amarrada
          a este relatório — sem isso ela cairia na fila de fotos soltas e alguém teria de juntá-la
          depois, no computador. A evidência de uma junta reprovada é o que menos pode se perder no
          caminho. Quando há foto, o PDF ganha a página de registro fotográfico; sem foto, não. */}
      <div className="mt-5">
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">
          Fotos {fotos.length > 0 && <span className="font-normal">· {fotos.length}</span>}
        </p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={receberFotos} />
        <button onClick={() => fileRef.current?.click()} disabled={enviandoFoto}
          className="w-full bg-white border-2 border-torg-blue text-torg-blue active:bg-torg-blue/5 rounded-xl py-3.5 text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {enviandoFoto ? <Loader2 size={19} className="animate-spin" /> : <Camera size={19} />} Tirar foto
        </button>
        {fotos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {fotos.map((ft) => (
              <span key={ft.id} className="relative">
                <img src={ft.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                <button onClick={() => apagarFoto(ft.id)}
                  className="absolute -top-1.5 -right-1.5 bg-white border border-gray-300 rounded-full p-0.5 text-torg-gray active:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── O RESULTADO GERAL ───────────────────────────────────────────────────────────────
          Vitor (21/08/2026): "essa questão de selecionar como aprovado, reprovado e o exame
          complementar em todos os relatórios que o inspetor for preencher".

          ⚠ Só APROVADO fecha o relatório. Reprovado volta para reparo e "exame complementar" ainda
          vai ter ensaio — nos dois ele continua aberto e volta para a lista, à espera da
          reinspeção. */}
      <div className="mt-5">
        <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Resultado da inspeção</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[["APROVADO", "A", "bg-emerald-600 border-emerald-600"],
            ["REPROVADO", "R", "bg-red-600 border-red-600"],
            ["REC", "REC", "bg-amber-500 border-amber-500"]].map(([v, sigla, cor]) => {
            const on = resultado === v;
            return (
              <button key={v} onClick={() => setResultado(on ? null : v)}
                className={`rounded-xl py-3 border leading-tight ${on ? `${cor} text-white` : "text-torg-dark border-gray-200 active:bg-gray-50"}`}>
                <span className="block text-[15px] font-bold">{sigla}</span>
                <span className={`block text-[10px] ${on ? "text-white/85" : "text-torg-gray"}`}>
                  {v === "REC" ? "Exame complementar" : RESULTADO_LABEL[v]}
                </span>
              </button>
            );
          })}
        </div>
        {resultado === "APROVADO" && (
          <p className="text-[12px] text-emerald-700 mt-1.5">O relatório fecha em {rel.rotuloRevisao}.</p>
        )}
        {(resultado === "REPROVADO" || resultado === "REC") && (
          <p className="text-[12px] text-amber-700 mt-1.5">
            O relatório continua aberto e volta para a lista, à espera da reinspeção.
          </p>
        )}
      </div>

      <button onClick={salvar} disabled={salvando}
        className="mt-5 w-full bg-torg-blue text-white active:bg-torg-dark rounded-2xl py-5 text-lg font-semibold inline-flex items-center justify-center gap-2.5 disabled:opacity-60">
        {salvando ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />} Gravar medidas
      </button>
    </Tela>
  );
}
