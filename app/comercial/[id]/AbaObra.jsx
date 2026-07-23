"use client";
import { Building2, Pencil, Hash, MapPin, CalendarRange, Users, AlertCircle } from "lucide-react";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtR$ = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const ESTOQUE = { PROPRIO_TORG: "Estoque próprio da Torg", CLIENTE_TERCEIRO: "Fornecido pelo cliente / terceiro" };
const DATABOOK = { PADRAO_TORG: "Padrão Torg", SNQC: "SNQC", RELATORIO_ACOMPANHAMENTO: "Relatório de acompanhamento" };

function Campo({ rotulo, valor, destaque, dica }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">{rotulo}</p>
      <p className={`text-sm ${destaque ? "font-bold text-torg-dark" : valor ? "text-torg-dark" : "text-gray-300"}`}>{valor || "—"}</p>
      {dica && <p className="text-[10px] text-torg-gray mt-0.5">{dica}</p>}
    </div>
  );
}

export default function AbaObra({ op, podeEditar, onEditar }) {
  const contatos = Array.isArray(op.clienteContatos) ? op.clienteContatos : [];
  const endereco = [op.clienteEndereco, op.clienteCidade, op.clienteUF, op.clienteCep].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
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

        {/* Referência do cliente — o número que cada cliente usa */}
        <div className={`mt-4 rounded-lg border p-4 ${op.refCliente ? "border-amber-200 bg-amber-50/60" : "border-dashed border-gray-300 bg-gray-50"}`}>
          <div className="flex items-start gap-3">
            <Hash size={18} className={op.refCliente ? "text-amber-700 mt-0.5" : "text-gray-400 mt-0.5"} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Referência do cliente</p>
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
            <Campo rotulo="Descrição / escopo" valor={op.descricao} />
          </div>
        )}
      </div>

      {/* Prazos, contrato e definições */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-4"><CalendarRange size={15} className="text-torg-blue" /> Prazos, contrato e definições</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo rotulo="Início" valor={fmtD(op.dataInicio)} />
          <Campo rotulo="Fim previsto" valor={fmtD(op.dataFimPrevista)} />
          <Campo rotulo="Fim real" valor={op.dataFimReal ? fmtD(op.dataFimReal) : null} />
          <Campo rotulo="Valor do contrato" valor={fmtR$(op.valorTotalContrato)} />
          <Campo rotulo="Material" valor={ESTOQUE[op.estoqueMaterial] || null} />
          <Campo rotulo="Data Book" valor={DATABOOK[op.tipoDataBook] || null} />
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
        {endereco && <div className="mt-4"><Campo rotulo="Endereço" valor={endereco} /></div>}
      </div>

      {/* Contatos usados nos envios */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-1"><Users size={15} className="text-torg-blue" /> Contatos do cliente <span className="text-torg-gray font-normal">({contatos.length})</span></h4>
        <p className="text-xs text-torg-gray mb-3">Quem recebe cronograma e ata desta OP. São registrados no primeiro envio e voltam prontos nos próximos — dá para corrigir na tela de envio do cronograma.</p>
        {contatos.length === 0 ? (
          <p className="text-sm text-torg-gray">Nenhum contato registrado ainda.</p>
        ) : (
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
            {contatos.map((c, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-2.5 text-[13px]">
                <span className="font-medium text-torg-dark whitespace-nowrap">{c.nome || "—"}</span>
                <span className="text-torg-gray flex-1 truncate">{c.email}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
