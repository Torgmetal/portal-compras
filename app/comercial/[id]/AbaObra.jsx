"use client";
import { Building2, Pencil, Hash, MapPin, CalendarRange, Users, AlertCircle } from "lucide-react";
import { resumoEscopo } from "@/lib/qualidade-escopo";
import { useState } from "react";
import { agruparReferencias } from "@/lib/referencias-cliente";
import PropostaObraConsulta from "@/components/comercial/PropostaObraConsulta";
import ReferenciasClienteResumo from "@/components/comercial/ReferenciasClienteResumo";
import ModalReferenciasCliente from "@/components/comercial/ModalReferenciasCliente";
import ModalContatosCliente from "@/components/comercial/ModalContatosCliente";
import { contatoVeFaturamento } from "@/lib/cliente-faturamento";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const ESTOQUE = { PROPRIO_TORG: "Estoque próprio da Torg", CLIENTE_TERCEIRO: "Fornecido pelo cliente / terceiro" };
const DATABOOK = { PADRAO_TORG: "Padrão Torg", SNQC: "SNQC", RELATORIO_ACOMPANHAMENTO: "Relatório de acompanhamento" };

function Campo({ rotulo, valor, destaque, dica, pre }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">{rotulo}</p>
      {/* `pre` preserva as quebras de linha do escopo lido da proposta/estudo */}
      <p className={`text-sm ${pre ? "whitespace-pre-line leading-relaxed" : ""} ${destaque ? "font-bold text-torg-dark" : valor ? "text-torg-dark" : "text-gray-300"}`}>{valor || "—"}</p>
      {dica && <p className="text-[10px] text-torg-gray mt-0.5">{dica}</p>}
    </div>
  );
}

export default function AbaObra({ op, podeEditar, onEditar, onAtualizar }) {
  const [editandoRefs, setEditandoRefs] = useState(false);
  const [editandoContatos, setEditandoContatos] = useState(false);
  const refsBase = agruparReferencias((op.referencias || []).filter((r) => !r.aditivoId));
  const temRefs = refsBase.projetos.length + refsBase.pedidos.length + refsBase.outros.length > 0;
  const contatos = Array.isArray(op.clienteContatos) ? op.clienteContatos : [];
  const endereco = [op.clienteEndereco, op.clienteCidade, op.clienteUF, op.clienteCep].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" aria-label="Contatos do cliente">
        <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2"><Users size={18} className="text-torg-blue" /> Contatos do cliente <span className="text-torg-gray font-normal">({contatos.length})</span></h3>
          {podeEditar && contatos.length > 0 && (
            <button onClick={() => setEditandoContatos(true)} className="text-xs text-torg-blue border border-torg-blue-200 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1.5" title="Quem vê Pedidos e faturamento no login do cliente">
              <Pencil size={12} /> Acessos no portal <span className="text-torg-gray font-normal">({contatos.filter(contatoVeFaturamento).length})</span>
            </button>
          )}
        </div>
        {editandoContatos && <ModalContatosCliente opId={op.id} contatos={contatos} onClose={() => setEditandoContatos(false)} onSaved={() => { setEditandoContatos(false); if (onAtualizar) onAtualizar(); else window.location.reload(); }} />}
        {contatos.length === 0 ? <p className="px-5 pb-4 text-sm text-torg-gray">Nenhum contato registrado.</p> : (
          <div className="overflow-x-auto" role="region" aria-label="Tabela de contatos do cliente" tabIndex={0}>
            <table className="w-full min-w-[1270px] table-fixed text-sm text-left">
              <colgroup><col style={{ width: 220 }} /><col /><col style={{ width: 280 }} /><col style={{ width: 210 }} /><col style={{ width: 160 }} /><col style={{ width: 170 }} /></colgroup>
              <thead className="bg-gray-50/60 text-torg-gray"><tr>{["Nome", "Função", "E-mail", "Telefone fixo", "Celular", "Acesso no portal"].map(t => <th key={t} className="px-4 py-2.5 font-medium whitespace-nowrap">{t}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">{contatos.map((c, i) => (
                <tr key={c.email || i} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 align-top font-medium text-torg-dark whitespace-nowrap">{c.nome || "—"}</td>
                  <td className="px-4 py-2.5 align-top text-torg-gray break-words">{c.funcao || "—"}</td>
                  <td className="px-4 py-2.5 align-top text-torg-blue whitespace-nowrap">{c.email || "—"}</td>
                  <td className="px-4 py-2.5 align-top text-torg-gray whitespace-nowrap">{c.telefone || "—"}</td>
                  <td className="px-4 py-2.5 align-top text-torg-gray whitespace-nowrap">{c.celular || "—"}</td>
                  <td className="px-4 py-2.5 align-top whitespace-nowrap">{contatoVeFaturamento(c) ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-100 font-medium">Pedidos e faturamento</span> : <span className="text-[11px] text-gray-400">documentos</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <PropostaObraConsulta opId={op.id} />

      {/* Identificação da obra */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Building2 size={18} className="text-torg-blue" /> Informações da obra</h3>
          {podeEditar && (
            <button onClick={onEditar} className="text-xs text-torg-blue border border-torg-blue-200 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-blue-50"><Pencil size={13} /> Editar</button>
          )}
        </div>
        <p className="text-sm text-torg-gray mb-4">Dados que identificam a obra. Saem nos documentos enviados ao cliente — ata, cronograma e relatórios.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo rotulo="Nº da OP (Torg)" valor={op.numero} destaque />
          <Campo rotulo="Cliente" valor={op.cliente} destaque />
          <Campo rotulo="Obra / empreendimento" valor={op.obra} destaque />
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <Campo rotulo="Endereço do cliente" valor={endereco || "Não informado"} pre />
          <Campo rotulo="Endereço de entrega" valor={op.kickoff?.entregaEndereco?.trim() || "Não informado"} pre />
        </div>

        {/* Referências do cliente — os códigos que cada cliente usa, com as palavras dele (16/09/2026) */}
        <div className={`mt-4 rounded-lg border p-4 ${temRefs || op.refCliente ? "border-amber-200 bg-amber-50/60" : "border-dashed border-gray-300 bg-gray-50"}`}>
          <div className="flex items-start gap-3">
            <Hash size={18} className={temRefs || op.refCliente ? "text-amber-700 mt-0.5" : "text-gray-400 mt-0.5"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider">Referências do cliente</p>
                {podeEditar && (
                  <button onClick={() => setEditandoRefs(true)} className="text-[11px] text-torg-blue font-medium inline-flex items-center gap-1 hover:underline"><Pencil size={11} /> {temRefs ? "Editar" : "Informar"}</button>
                )}
              </div>
              {temRefs && <div className="mb-2"><ReferenciasClienteResumo arvore={refsBase} mostrarValores={false} /></div>}
              {editandoRefs && <ModalReferenciasCliente opId={op.id} onClose={() => setEditandoRefs(false)} onSaved={() => { setEditandoRefs(false); if (onAtualizar) onAtualizar(); else window.location.reload(); }} />}
              <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">{temRefs ? "Como sai nos documentos" : "Referência do cliente"}</p>
              {op.refCliente ? (
                <p className="text-lg font-bold text-amber-800 break-words">{op.refCliente}</p>
              ) : (
                <p className="text-sm text-torg-gray inline-flex items-center gap-1.5"><AlertCircle size={13} className="text-amber-500" /> Não preenchida — se o cliente usa um código próprio para esta obra, cadastre em <strong>Editar</strong>.</p>
              )}
              <p className="text-[11px] text-torg-gray mt-1.5">O código que o <strong>cliente</strong> usa para esta obra (contrato, WBS, TAG…). Nem toda obra tem. Quando preenchida, aparece na <strong>ata de reunião</strong>, no e‑mail do <strong>cronograma</strong> e na capa do <strong>Relatório de Status</strong>.</p>
            </div>
          </div>
        </div>

        {op.descricao && (
          <div className="mt-4">
            <Campo rotulo="Descrição / escopo" valor={op.descricao} pre />
          </div>
        )}
      </div>

      {/* Prazos e definições */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-4"><CalendarRange size={15} className="text-torg-blue" /> Prazos e definições</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo rotulo="Início" valor={fmtD(op.dataInicio)} />
          <Campo rotulo="Fim previsto" valor={fmtD(op.dataFimPrevista)} />
          <Campo rotulo="Fim real" valor={op.dataFimReal ? fmtD(op.dataFimReal) : null} />
          <Campo rotulo="Material" valor={ESTOQUE[op.estoqueMaterial] || null} />
          <Campo rotulo="Data Book" valor={DATABOOK[op.tipoDataBook] || null} />
          {/* O que a obra exige de inspeção — decide o que o inspetor vê e o que o data
              book cobra. Nasce na abertura da OP. */}
          <Campo rotulo="Escopo de qualidade" valor={resumoEscopo(op)} />
        </div>
      </div>

      {/* Cadastro do cliente */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-4"><MapPin size={15} className="text-torg-blue" /> Cadastro do cliente</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo rotulo="Razão social" valor={op.clienteRazaoSocial} />
          <Campo rotulo="CNPJ" valor={op.clienteCnpj} />
          <Campo rotulo="Inscrição estadual" valor={op.clienteIE} />
          <Campo rotulo="Contato" valor={op.clienteContato} />
          <Campo rotulo="E-mail" valor={op.clienteEmail} />
          <Campo rotulo="Telefone" valor={op.clienteTelefone} />
        </div>
      </div>


    </div>
  );
}
