"use client";
// ─── A FILA DE ENTRADA DO ACABAMENTO, DO JATO E DA PINTURA ─────────
//
// ⚠⚠ A ENTRADA É AUTOMÁTICA. Vitor (06/09/2026): "o que for ficando pronto da solda já deve
// aparecer para a fila do acabamento e o que for ficando pronto do acabamento aparecer na fila do
// jato — igual fizemos na solda". Não há liberação: terminar o setor anterior É a entrada aqui.
//
// ⚠ ESCOLHE-SE A OBRA, NÃO A PEÇA. "Vamos selecionar uma única OP e vamos executar os trabalhos de
// acabamento." A tela abre pela lista de obras com o peso e os dias que cada uma custa na meta; o
// detalhe por peça existe para quem quiser conferir, não para quem programa.
//
// ⚠ MANDAR PARA A BANCADA É INTENÇÃO, não ordem — mesma regra da solda (Vitor, 01/09). O portal
// anota a decisão do PCP; o que aconteceu de fato volta pelo Syneco.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, ArrowRight, Undo2, Flame, Sparkles, Paintbrush } from "lucide-react";
import { useStore } from "@/lib/store";

const nkg = (n) => `${Math.round(Number(n) || 0).toLocaleString("pt-BR")} kg`;
const n1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("pt-BR");
const hoje = () => new Date().toISOString().slice(0, 10);

export default function FilaSetorClient({ setor }) {
  const { showToast } = useStore();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [opSel, setOpSel] = useState(null);
  const [bancada, setBancada] = useState(null);
  const [dia, setDia] = useState(hoje());
  const [enviando, setEnviando] = useState(null);

  const buscar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/pcp/fila-setor?setor=${setor}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar a fila");
      setDados(j);
      setBancada((b) => b || j.bancadas?.[0]?.k || null);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [setor]);

  useEffect(() => { buscar(); }, [buscar]);

  const daObra = useMemo(
    () => (dados?.fila || []).filter((f) => f.opNumero === opSel),
    [dados, opSel],
  );

  async function mandar(ids, paraBancada) {
    if (!ids.length) return;
    setEnviando(paraBancada === null ? "voltar" : "enviar");
    try {
      const r = await fetch("/api/pcp/fila-setor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor, ids, bancada: paraBancada, dia: paraBancada ? dia : null,
          // ⚠ só quando foi preenchida: o AuditLog guarda o que destravou a liberação
          ...(paraBancada && calc ? { especificacao: {
            demaos: Math.max(1, Number(spec.demaos) || 1),
            ...(spec.produto ? { produto: spec.produto } : {}),
            ...(spec.cor ? { cor: spec.cor } : {}),
            espessuraSeca: Number(String(spec.espessuraSeca).replace(",", ".")),
            solidosVol: Number(String(spec.solidosVol).replace(",", ".")),
            ...(String(spec.diluicaoPct).trim() !== "" ? { diluicaoPct: Number(String(spec.diluicaoPct).replace(",", ".")) } : {}),
            ...(spec.secagem ? { secagem: spec.secagem } : {}),
          } } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível gravar");
      // ⚠ update otimista: refetch aqui faria a lista piscar e perder a obra selecionada
      setDados((d) => !d ? d : {
        ...d,
        fila: d.fila.map((f) => ids.includes(f.id)
          ? { ...f, bancada: paraBancada, dia: paraBancada ? dia : null } : f),
      });
      showToast(paraBancada
        ? `${j.atualizadas} peça(s) para ${nomeBancada(paraBancada)} em ${dia.split("-").reverse().join("/")}`
        : `${j.atualizadas} peça(s) de volta para a fila`, "sucesso");
    } catch (e) { showToast(e.message, "erro"); } finally { setEnviando(null); }
  }

  const nomeBancada = (k) => dados?.bancadas?.find((b) => b.k === k)?.nome || k;
  const Icone = setor === "PINTURA" ? Paintbrush : setor === "JATO" ? Sparkles : Flame;

  // ⚠ NA PINTURA NÃO SE DIZ "BANCADA". Vitor (06/09/2026) chama os postos de GALPÃO ("o galpão 1
  // que fica na Torg (…) e o Galpão 2 que seria um galpão apoio"). A tela usa a palavra da fábrica.
  /* ⚠⚠ JATO E PINTURA SE MEDEM EM SUPERFÍCIE. Vitor (07/09/2026): "no jato será necessário ter a
     m² das peças". Na fila de hoje a relação vai de 5 a 46 m² por tonelada conforme a peça — uma
     tonelada de chapa fina jateia quase dez vezes mais que uma de perfil pesado.
     O ACABAMENTO fica de fora: rebarba e esmerilho seguem o peso, não a área. */
  const PORM2 = setor === "JATO" || setor === "PINTURA";
  const POSTO = setor === "PINTURA" ? "galpão" : "bancada";
  const Posto = POSTO[0].toUpperCase() + POSTO.slice(1);

  /* ── A ESPECIFICAÇÃO INFORMADA NA HORA ────────────────────────────────────────
     ⚠⚠ Vitor (07/09/2026): "para essas obras que não temos as especificações do PLP teria uma
     maneira de, quando formos selecionar essas peças para pintura, deixar informar essas partes e
     já fazer o cálculo?". E, sobre gravar: "não grava não, é apenas para conseguir liberar para
     pintura e não ficar amarrado; esse PLP deve vir preenchido desde o início da OP".
     Então isto NÃO vira registro da obra: vai junto da liberação, para o AuditLog, e acaba ali. */
  const pinturaDaOp = (dados?.pintura || []).find((x) => x.opNumero === opSel) || null;
  const faltaSpec = !!(pinturaDaOp?.falta?.length);
  const [spec, setSpec] = useState({ demaos: "1", produto: "", cor: "", espessuraSeca: "", solidosVol: "", diluicaoPct: "", secagem: "" });
  const [abrirSpec, setAbrirSpec] = useState(false);
  useEffect(() => { setAbrirSpec(false); }, [opSel]);

  const num = (v) => { const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : null; };
  /* ⚠ MESMA FÓRMULA DA QUALIDADE, e a mesma do editor do PLP: rendimento = SV × 10 ÷ espessura, e a
     camada úmida = seca × (100 + %diluição) ÷ SV. 15% de perda é o padrão do estudo de pintura.
     ⚠ Diluição VAZIA não é zero: sem ela a úmida não sai, e chutar daria um número que o pintor
     mede o pente contra. */
  const calc = useMemo(() => {
    const sv = num(spec.solidosVol), esp = num(spec.espessuraSeca);
    const dem = Math.max(1, Number(spec.demaos) || 1);
    const m2 = pinturaDaOp?.m2 || 0;
    const dil = String(spec.diluicaoPct).trim() === "" ? null : Number(String(spec.diluicaoPct).replace(",", "."));
    if (!sv || !esp || !m2) return null;
    const rend = (sv * 10) / esp * 0.85;
    const litros = (m2 / rend) * dem;
    return {
      m2Aplicar: Math.round(m2 * dem * 100) / 100,
      litros: Math.round(litros * 100) / 100,
      galoes: Math.ceil(litros / 18),
      diluente: dil == null ? null : Math.round(litros * (dil / 100) * 100) / 100,
      umida: dil == null ? null : Math.round((esp * (100 + dil)) / sv),
    };
  }, [spec, pinturaDaOp]);

  if (carregando && !dados) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 flex items-center justify-center gap-3 text-torg-gray">
        <Loader2 size={20} className="animate-spin" /> Carregando a fila…
      </div>
    );
  }
  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={16} /> {erro}
        <button onClick={buscar} className="ml-auto text-xs underline">Tentar novamente</button>
      </div>
    );
  }
  if (!dados?.fila?.length) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
        <Icone size={28} className="mx-auto text-gray-300" />
        <p className="mt-3 text-sm font-semibold text-torg-dark">A fila está vazia</p>
        <p className="mt-1 text-xs text-torg-gray">
          Nada terminou {dados?.anterior === "SOLDA" ? "a solda" : dados?.anterior === "JATO" ? "o jato" : "o acabamento"} e está esperando aqui.
        </p>
      </div>
    );
  }

  const pendentes = daObra.filter((f) => !f.bancada);
  const naBancada = daObra.filter((f) => f.bancada);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-2xl font-extrabold text-torg-dark tabular-nums leading-none">{dados.total.pecas}</p>
          <p className="text-[11px] text-torg-gray">peças esperando</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-torg-dark tabular-nums leading-none">{nkg(dados.total.kg)}</p>
          <p className="text-[11px] text-torg-gray">na fila</p>
        </div>
        {PORM2 && (
          <div>
            <p className="text-2xl font-extrabold text-torg-dark tabular-nums leading-none">
              {dados.total.m2?.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) ?? "—"}
            </p>
            <p className="text-[11px] text-torg-gray">
              m² de superfície
              {dados.total.semArea ? <span className="text-torg-orange"> · {dados.total.semArea} sem área</span> : null}
            </p>
          </div>
        )}
        <div>
          <p className="text-2xl font-extrabold text-torg-orange tabular-nums leading-none">{n1(dados.total.dias)}</p>
          <p className="text-[11px] text-torg-gray">dias na meta ({nkg(dados.capacidadeKgDia)}/dia)</p>
        </div>
        <p className="text-[11px] text-torg-gray max-w-sm ml-auto leading-relaxed">
          Entra sozinho o que termina{" "}
          {dados.anterior === "SOLDA" ? "a solda" : dados.anterior === "JATO" ? "o jato" : "o acabamento"} —
          não há liberação a fazer.
        </p>
      </div>

      {/* ⚠ A fila só pode ser lida como completa se a consulta não bateu no teto. Ver LIMITE_PECAS
          em lib/fila-setor.js: o teto antigo (8.000) ficava abaixo do total real e cortava peça sem
          avisar ninguém. Se isto aparecer, o número na tela está MENOR que a realidade. */}
      {dados.truncado && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            <b>Fila incompleta.</b> A consulta atingiu o limite de peças e parte da fila ficou de
            fora — os números abaixo estão menores que a realidade. Avise o time do portal.
          </span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h2 className="text-[13px] font-bold text-torg-dark">Escolha a obra para atacar</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr className="text-[10px] uppercase tracking-wide text-torg-gray">
                <th className="text-left px-4 py-2 font-bold">OP</th>
                <th className="text-left px-4 py-2 font-bold">Obra</th>
                <th className="text-right px-4 py-2 font-bold">Peças</th>
                <th className="text-right px-4 py-2 font-bold">kg</th>
                <th className="text-right px-4 py-2 font-bold">Dias</th>
                {PORM2 && <th className="text-right px-4 py-2 font-bold">m²</th>}
                <th className="text-right px-4 py-2 font-bold">Sem {POSTO}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dados.obras.map((o) => (
                <tr key={o.opNumero}
                    onClick={() => setOpSel(o.opNumero === opSel ? null : o.opNumero)}
                    className={`cursor-pointer ${o.opNumero === opSel ? "bg-torg-blue/5" : "hover:bg-gray-50/60"}`}>
                  <td className="px-4 py-2 font-bold text-torg-blue">OP-{o.opNumero}</td>
                  <td className="px-4 py-2 text-torg-dark truncate max-w-[280px]">{o.obra || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{o.pecas}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{nkg(o.kg)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{n1(o.dias)}</td>
                  {PORM2 && (
                    <td className="px-4 py-2 text-right tabular-nums">
                      {o.m2 ? o.m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"}
                      {o.semArea ? <span className="text-torg-orange text-[10px]"> ({o.semArea} s/área)</span> : null}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right tabular-nums">
                    {o.semBancada
                      ? <span className="text-torg-orange font-semibold">{o.semBancada}</span>
                      : <span className="text-emerald-600 font-semibold">todas posicionadas</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {opSel && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <h2 className="text-[13px] font-bold text-torg-dark">
              OP-{opSel} · {pendentes.length} sem {POSTO}
              {naBancada.length ? <span className="text-torg-gray font-normal"> · {naBancada.length} já posicionadas</span> : null}
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {faltaSpec && (
                <button onClick={() => setAbrirSpec((v) => !v)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100">
                  {abrirSpec ? "Fechar" : `Informar a especificação (falta ${pinturaDaOp.falta.join(", ")})`}
                </button>
              )}
              {dados.bancadas.length > 1 && (
                <select value={bancada || ""} onChange={(e) => setBancada(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-torg-dark">
                  {dados.bancadas.map((b) => <option key={b.k} value={b.k}>{b.nome}</option>)}
                </select>
              )}
              <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
                     className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-torg-dark tabular-nums" />
              <button
                onClick={() => mandar(pendentes.map((f) => f.id), bancada)}
                disabled={!pendentes.length || !!enviando}
                className="text-xs font-semibold bg-torg-blue text-white rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                {enviando === "enviar" ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                Mandar {pendentes.length} para {dados.bancadas.length > 1 ? nomeBancada(bancada) : `a ${POSTO}`}
              </button>
              {naBancada.length > 0 && (
                <button
                  onClick={() => mandar(naBancada.map((f) => f.id), null)}
                  disabled={!!enviando}
                  className="text-xs font-semibold border border-gray-200 text-torg-gray rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                  {enviando === "voltar" ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                  Devolver à fila
                </button>
              )}
            </div>
          </div>
          {/* ⚠ NÃO GRAVA NO PLP. O que sai daqui viaja com a liberação e fica no AuditLog — o
              PlanoPintura continua sendo documento da Qualidade e tem de vir preenchido da
              engenharia. Isto existe só para a obra antiga não travar a fila. */}
          {abrirSpec && faltaSpec && (
            <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/40">
              <p className="text-[11px] text-amber-900 mb-2">
                A OP-{opSel} está sem <b>{pinturaDaOp.falta.join(" e ")}</b>. Informe abaixo para liberar e ver a
                quantidade — <b>isto não altera o PLP da obra</b>, fica registrado só nesta liberação.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {[["demaos", "Demãos", "1"], ["produto", "Produto", "ex.: Industhane"], ["cor", "Cor", "ex.: Cinza N5"],
                  ["espessuraSeca", "Esp. seca máx. µm", "100"], ["solidosVol", "Sólidos vol. %", "64"],
                  ["diluicaoPct", "Diluição %", "10"], ["secagem", "Secagem", "8 horas"]].map(([k, rot, ph]) => (
                  <label key={k} className="block">
                    <span className="text-[10px] text-torg-gray block mb-0.5">{rot}</span>
                    <input value={spec[k]} onChange={(e) => setSpec((x) => ({ ...x, [k]: e.target.value }))}
                      placeholder={ph}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-torg-dark" />
                  </label>
                ))}
              </div>
              {calc ? (
                <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-torg-dark">
                  <span><b>{calc.m2Aplicar.toLocaleString("pt-BR")}</b> m² a aplicar</span>
                  <span><b>{calc.litros.toLocaleString("pt-BR")}</b> L de tinta</span>
                  <span><b>{calc.galoes}</b> galões</span>
                  <span>{calc.diluente != null
                    ? <><b>{calc.diluente.toLocaleString("pt-BR")}</b> L de diluente</>
                    : <span className="text-amber-800">diluente: informe a diluição</span>}</span>
                  {/* ⚠ a úmida é o que o pintor mede na hora — a seca só depois de curar. */}
                  <span className={calc.umida ? "font-bold text-emerald-700" : "text-amber-800"}>
                    {calc.umida ? `${calc.umida} µm úmidos (o pente deve marcar isto)` : "úmida: informe a diluição"}
                  </span>
                </div>
              ) : (
                <p className="mt-2.5 text-[11px] text-torg-gray">
                  Preencha <b>espessura seca</b> e <b>sólidos por volume</b> para o portal calcular.
                </p>
              )}
            </div>
          )}

          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 sticky top-0">
                <tr className="text-[10px] uppercase tracking-wide text-torg-gray">
                  <th className="text-left px-4 py-2 font-bold">Marca</th>
                  <th className="text-left px-4 py-2 font-bold">Descrição</th>
                  <th className="text-right px-4 py-2 font-bold">Qte</th>
                  <th className="text-right px-4 py-2 font-bold">kg</th>
                  {PORM2 && <th className="text-right px-4 py-2 font-bold">m²</th>}
                  <th className="text-left px-4 py-2 font-bold">{Posto}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {daObra.map((f) => (
                  <tr key={f.id} className={f.bancada ? "bg-emerald-50/40" : ""}>
                    <td className="px-4 py-1.5 font-mono font-semibold text-torg-dark">{f.marca}</td>
                    <td className="px-4 py-1.5 text-torg-gray truncate max-w-[320px]">{f.descricao || f.perfil || "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{f.qte}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{f.kg.toLocaleString("pt-BR")}</td>
                    {PORM2 && (
                      /* ⚠ "sem área" não é zero: a peça existe e vai ser jateada, só não veio com
                         área na LPC. Mostrar 0 faria o total parecer completo. */
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {f.m2 == null
                          ? <span className="text-torg-orange text-[11px]">sem área</span>
                          : f.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                      </td>
                    )}
                    <td className="px-4 py-1.5">
                      {f.bancada
                        ? <span className="text-[11px] font-semibold text-emerald-700">
                            {nomeBancada(f.bancada)}{f.dia ? ` · ${f.dia.split("-").reverse().join("/")}` : ""}
                          </span>
                        : <span className="text-[11px] text-torg-gray">na fila</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
