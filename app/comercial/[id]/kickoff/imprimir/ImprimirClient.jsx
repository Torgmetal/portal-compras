"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, Printer, ArrowLeft } from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtKg = (v) => (v != null && v !== "" ? `${Number(v).toLocaleString("pt-BR")} kg` : "—");
const linhas = (txt) => String(txt || "").split("\n").map((s) => s.trim()).filter(Boolean);
const FRETE_LABEL = { TORG: "Por conta da Torg (CIF)", CLIENTE: "Por conta do cliente (FOB)" };

export default function ImprimirClient({ opId }) {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/kickoff`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.error || "Erro")))))
      .then(setData)
      .catch((e) => setErro(e.message));
  }, [opId]);

  // dispara o diálogo de impressão assim que o documento estiver montado
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [data]);

  if (erro) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-2xl mx-auto mt-10">
      <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
      <p className="text-red-700 font-medium">{erro}</p>
    </div>
  );
  if (!data) return <div className="flex items-center justify-center py-20 gap-3 text-torg-gray"><Loader2 size={22} className="animate-spin" /> Montando o PDF…</div>;

  const { op, sugestoes } = data;
  const k = data.kickoff || {};
  const todosItens = [...(op.itens || []), ...(op.aditivos || []).flatMap((a) => a.itens || [])];
  const incluso = linhas(k.escopoIncluso);
  const excluso = linhas(k.escopoExcluso);
  const pontos = linhas(k.pontosAtencao);
  const cronograma = (Array.isArray(k.cronograma) ? k.cronograma : []).filter((c) => c.fase?.trim());
  const prioridades = (Array.isArray(k.prioridades) ? k.prioridades : []).filter((p) => p.descricao?.trim());
  const pesoResumo = (Array.isArray(k.pesoResumo) ? k.pesoResumo : (sugestoes?.pesoResumo || [])).filter((p) => p.descricao?.trim());
  const eventos = (Array.isArray(k.faturamentoEventos) ? k.faturamentoEventos : []).filter((ev) => ev.descricao?.trim());
  const pesoTotal = pesoResumo
    .filter((p) => !/\btotal\b/i.test(String(p.descricao || "")))
    .reduce((s, p) => s + (Number(p.pesoKg) || 0), 0);
  const aceites = Array.isArray(k.aceites) ? k.aceites : [];

  const anexos = [
    ["Proposta comercial", k.propostaPdfNome],
    ["Proposta técnica", k.propostaTecnicaPdfNome],
    ["PLP (Plano de Pintura)", k.pinturaPlpNome],
    ["Documento de inspeção (ITP)", k.inspecaoArquivoNome],
  ].filter(([, nome]) => nome);

  const enderecoFiscal = [op.clienteEndereco, op.clienteCidade && `${op.clienteCidade}/${op.clienteUF || ""}`, op.clienteCep].filter(Boolean).join(" — ");

  return (
    <>
      <style>{`
        @media print {
          aside { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .kdoc { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 13mm 13mm 16mm; }
        }
        .kband { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .ksec { break-inside: avoid; }
      `}</style>

      {/* barra de ação (some na impressão) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2.5 mb-6">
        <a href={`/comercial/${opId}/kickoff`} className="inline-flex items-center gap-1.5 text-sm text-torg-gray hover:text-torg-blue">
          <ArrowLeft size={15} /> Voltar ao Kick Off
        </a>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-semibold">
          <Printer size={15} /> Imprimir / Salvar PDF
        </button>
      </div>

      <div className="kdoc max-w-[820px] mx-auto bg-white px-2 pb-10 text-torg-dark">
        {/* Cabeçalho */}
        <header className="kband flex items-center justify-between gap-4 bg-torg-dark text-white rounded-t-lg px-6 py-5 mb-1">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torg-logo-white.png" alt="Torg Metal" className="h-9 w-auto" />
            <div className="border-l border-white/25 pl-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/70">Kick Off da Obra</p>
              <h1 className="text-xl font-extrabold leading-tight">OP {fmtOP(op.numero)}</h1>
            </div>
          </div>
          <div className="text-right text-xs text-white/80">
            <p className="font-semibold text-white text-sm">{op.cliente}</p>
            {op.obra && <p>{op.obra}</p>}
            <p className="mt-1">Emitido em {new Date().toLocaleDateString("pt-BR")}</p>
          </div>
        </header>
        <div className="kband h-1 bg-torg-orange rounded-b mb-6" />

        {/* Dados do cliente */}
        <Secao titulo="Dados do cliente">
          <Grid>
            <Linha label="Razão social" valor={op.clienteRazaoSocial || op.cliente} />
            <Linha label="CNPJ" valor={op.clienteCnpj} />
            <Linha label="Contato" valor={op.clienteContato} />
            <Linha label="E-mail" valor={op.clienteEmail} />
            <Linha label="Telefone" valor={op.clienteTelefone} />
            <Linha label="Pedido de compra / contrato" valor={k.pedidoCompraCliente} />
            <Linha label="Data de entrega acordada" valor={fmtData(k.dataEntregaAcordada)} />
          </Grid>
        </Secao>

        {/* Escopo */}
        {(k.escopo || incluso.length || excluso.length) ? (
          <Secao titulo="Escopo do fornecimento">
            {k.escopo && <p className="text-sm leading-relaxed mb-3 whitespace-pre-wrap">{k.escopo}</p>}
            {(incluso.length > 0 || excluso.length > 0) && (
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <p className="text-xs font-bold text-emerald-700 mb-1">✅ Incluído</p>
                  <ul className="text-sm space-y-0.5">{incluso.length ? incluso.map((i, x) => <li key={x}>• {i}</li>) : <li className="text-torg-gray">—</li>}</ul>
                </div>
                <div>
                  <p className="text-xs font-bold text-red-700 mb-1">🚫 Excluído / por conta do cliente</p>
                  <ul className="text-sm space-y-0.5">{excluso.length ? excluso.map((i, x) => <li key={x}>• {i}</li>) : <li className="text-torg-gray">—</li>}</ul>
                </div>
              </div>
            )}
          </Secao>
        ) : null}

        {/* Resumo de pesos */}
        {pesoResumo.length > 0 && (
          <Secao titulo="Resumo de pesos">
            <Tabela cabec={["Grupo / item", "Qtd", "Peso"]} alinhas={["", "right", "right"]}>
              {pesoResumo.map((p, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2">{p.descricao}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{p.qtd ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtKg(p.pesoKg)}</td>
                </tr>
              ))}
              {pesoTotal > 0 && (
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td className="py-1.5 pr-2">Total</td>
                  <td></td>
                  <td className="py-1.5 text-right tabular-nums">{fmtKg(Math.round(pesoTotal))}</td>
                </tr>
              )}
            </Tabela>
          </Secao>
        )}

        {/* Cronograma */}
        {cronograma.length > 0 && (
          <Secao titulo="Cronograma prévio">
            <Tabela cabec={["Fase / setor", "Data limite", "Obs."]} alinhas={["", "", ""]}>
              {cronograma.map((c, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2 font-medium">{c.fase}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{c.data ? fmtData(c.data + "T12:00") : "—"}</td>
                  <td className="py-1.5 text-torg-gray">{c.obs || ""}</td>
                </tr>
              ))}
            </Tabela>
          </Secao>
        )}

        {/* Prioridades */}
        {prioridades.length > 0 && (
          <Secao titulo="Prioridades">
            <ul className="text-sm space-y-1">
              {prioridades.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-torg-blue-50 text-torg-blue text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}º</span>
                  <span className="flex-1">{p.descricao}</span>
                  {p.data && <span className="text-torg-gray text-xs">{fmtData(p.data + "T12:00")}</span>}
                </li>
              ))}
            </ul>
          </Secao>
        )}

        {/* Entrega e frete */}
        {(k.frete || k.entregaEndereco) && (
          <Secao titulo="Entrega e frete">
            <Grid>
              <Linha label="Frete" valor={FRETE_LABEL[k.frete] || "—"} />
            </Grid>
            {k.entregaEndereco && <p className="text-sm mt-1 whitespace-pre-wrap"><span className="text-torg-gray text-xs">Endereço de entrega: </span>{k.entregaEndereco}</p>}
          </Secao>
        )}

        {/* Pintura */}
        {k.padraoPintura && (
          <Secao titulo="Padrão de pintura">
            <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono">{k.padraoPintura}</p>
          </Secao>
        )}

        {/* Inspeção */}
        {k.inspecao && (
          <Secao titulo="Inspeção">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{k.inspecao}</p>
          </Secao>
        )}

        {/* Pontos de atenção */}
        {pontos.length > 0 && (
          <Secao titulo="Pontos de atenção">
            <ul className="text-sm space-y-1">
              {pontos.map((p, i) => <li key={i} className="flex items-start gap-2"><span className="text-red-500 mt-0.5">▲</span> {p}</li>)}
            </ul>
          </Secao>
        )}

        {/* Reuniões e observações */}
        {(k.kickoffComercialEm || k.kickoffSetoresEm || k.observacoes) && (
          <Secao titulo="Reuniões e observações">
            <Grid>
              <Linha label="Kick off com o comercial" valor={fmtData(k.kickoffComercialEm)} />
              <Linha label="Kick off com os setores" valor={fmtData(k.kickoffSetoresEm)} />
            </Grid>
            {k.observacoes && <p className="text-sm mt-1 whitespace-pre-wrap">{k.observacoes}</p>}
          </Secao>
        )}

        {/* ───── Fiscal & financeiro ───── */}
        {(todosItens.length > 0 || k.tipoFaturamento || eventos.length || k.retencaoContratual || k.segurosObrigatorios || k.notaRetorno || k.fiscalObservacao) && (
          <>
            <h2 className="kband bg-torg-blue/10 text-torg-blue text-sm font-bold uppercase tracking-wide rounded px-3 py-1.5 mt-8 mb-4">Fiscal &amp; financeiro</h2>

            <Secao titulo="Dados fiscais">
              <Grid>
                <Linha label="Razão social" valor={op.clienteRazaoSocial || op.cliente} />
                <Linha label="CNPJ" valor={op.clienteCnpj} />
                <Linha label="IE" valor={op.clienteIE} />
                <Linha label="Pedido de compra do cliente" valor={k.pedidoCompraCliente} />
                <Linha label="Endereço fiscal" valor={enderecoFiscal} span />
                <Linha label="Local de entrega" valor={k.entregaEndereco} span />
              </Grid>
            </Secao>

            {todosItens.length > 0 && (
              <Secao titulo="Faturamento por linha do pedido">
                <Tabela cabec={["Item", "Categoria", "Faturamento"]} alinhas={["", "", "center"]}>
                  {todosItens.map((it, i) => (
                    <tr key={it.id || i} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2">{it.descricao}</td>
                      <td className="py-1.5 pr-2 text-torg-gray text-xs">{it.categoria || "—"}</td>
                      <td className="py-1.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${it.faturamentoDireto ? "bg-amber-100 text-amber-800" : "bg-torg-blue-50 text-torg-blue"}`}>
                          {it.faturamentoDireto ? "Direto (cliente)" : "Torg"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </Tabela>
                {k.notaRetorno && <p className="text-sm mt-2"><b>Nota de retorno:</b> sim{k.notaRetornoObs ? ` — ${k.notaRetornoObs}` : ""}</p>}
              </Secao>
            )}

            {(k.tipoFaturamento || eventos.length > 0 || k.retencaoContratual || k.segurosObrigatorios) && (
              <Secao titulo="Como será o faturamento">
                {k.tipoFaturamento && <p className="text-sm mb-2"><span className="text-torg-gray text-xs">Tipo: </span>{k.tipoFaturamento}</p>}
                {eventos.length > 0 && (
                  <Tabela cabec={["Evento", "%", "Valor (R$)", "Prazo pgto.", "Medição", "Obs. NF"]} alinhas={["", "right", "right", "", "center", ""]}>
                    {eventos.map((ev, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1.5 pr-2 font-medium">{ev.descricao}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{ev.percentual ?? ""}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{ev.valor != null && ev.valor !== "" ? Number(ev.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>
                        <td className="py-1.5 pr-2">{ev.prazoPagamento || ""}</td>
                        <td className="py-1.5 pr-2 text-center">{ev.medicao || ""}</td>
                        <td className="py-1.5 text-torg-gray">{ev.obsNF || ""}</td>
                      </tr>
                    ))}
                  </Tabela>
                )}
                <Grid className="mt-3">
                  <Linha label="Retenção contratual" valor={k.retencaoContratual} />
                  <Linha label="Seguros obrigatórios" valor={k.segurosObrigatorios} />
                </Grid>
              </Secao>
            )}

            {k.fiscalObservacao && (
              <Secao titulo="Observações complementares">
                <p className="text-sm whitespace-pre-wrap">{k.fiscalObservacao}</p>
              </Secao>
            )}
          </>
        )}

        {/* Anexos */}
        {anexos.length > 0 && (
          <Secao titulo="Documentos anexados (no sistema)">
            <ul className="text-sm space-y-0.5">
              {anexos.map(([rotulo, nome], i) => <li key={i}>• <b>{rotulo}:</b> {nome}</li>)}
            </ul>
          </Secao>
        )}

        {/* Aceites */}
        {aceites.length > 0 && (
          <Secao titulo="Registro de aceites">
            <Tabela cabec={["E-mail", "Tipo", "Status"]} alinhas={["", "", "right"]}>
              {aceites.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2">{a.email}</td>
                  <td className="py-1.5 pr-2 uppercase text-xs">{a.tipo === "FISCAL" ? "fiscal" : "geral"}</td>
                  <td className="py-1.5 text-right">{a.aceitoEm ? `✓ ${fmtData(a.aceitoEm)}` : "pendente"}</td>
                </tr>
              ))}
            </Tabela>
          </Secao>
        )}

        <p className="text-[10px] text-torg-gray text-center mt-8 pt-3 border-t border-gray-100">
          Torg Metal — documento gerado pelo Workspace Torg em {new Date().toLocaleString("pt-BR")}. Uso interno.
        </p>
      </div>
    </>
  );
}

/* ── helpers de layout do documento ───────────────────────────── */
function Secao({ titulo, children }) {
  return (
    <section className="ksec mb-5">
      <h3 className="text-[13px] font-bold text-torg-dark border-b-2 border-torg-blue/20 pb-1 mb-2.5">{titulo}</h3>
      {children}
    </section>
  );
}
function Grid({ children, className = "" }) {
  return <div className={`grid grid-cols-2 gap-x-8 gap-y-1 ${className}`}>{children}</div>;
}
function Linha({ label, valor, span }) {
  return (
    <div className={`text-sm ${span ? "col-span-2" : ""}`}>
      <span className="text-torg-gray text-xs">{label}: </span>
      <span className="font-medium">{valor || "—"}</span>
    </div>
  );
}
function Tabela({ cabec, alinhas = [], children }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-torg-gray">
          {cabec.map((c, i) => (
            <th key={i} className={`pb-1 font-semibold ${alinhas[i] === "right" ? "text-right" : alinhas[i] === "center" ? "text-center" : ""}`}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
