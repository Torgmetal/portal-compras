"use client";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { DADOS_TORG } from "@/lib/empresa";

const fmtKg = (v) => `${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
// data do romaneio é date-level (input date → UTC midnight) → exibe em UTC
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

const NF_LABEL = { PENDENTE: "Pendente", SOLICITADA: "Solicitada", EMITIDA: "Emitida" };

export default function RomaneioDoc({ romaneio: r }) {
  const itens = r.itens || [];
  const totalUn = itens.reduce((s, it) => s + (it.qtd || 0), 0);
  const totalKg = itens.reduce((s, it) => s + (it.pesoKg || 0), 0) || r.pesoRealKg || 0;

  return (
    <div className="bg-gray-100 min-h-screen print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: "@media print{@page{size:A4;margin:12mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}" }} />

      {/* Barra de ações (não imprime) */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/expedicao/pedidos" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> Voltar
        </Link>
        <button
          onClick={() => window.print()}
          className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-4 py-2 rounded-lg inline-flex items-center gap-2"
        >
          <Printer size={15} /> Imprimir / Salvar PDF
        </button>
      </div>

      {/* Documento A4 */}
      <div className="max-w-[800px] mx-auto bg-white my-6 p-10 shadow-sm print:my-0 print:p-0 print:shadow-none print:max-w-none text-[12px] text-torg-dark">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b-2 border-torg-blue pb-3">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torg-logo.svg" alt="Torg Metal" className="h-12 w-auto" />
            <div className="text-[10px] leading-tight text-torg-gray">
              <p className="text-[13px] font-bold text-torg-dark">{DADOS_TORG.razaoSocial}</p>
              <p>CNPJ {DADOS_TORG.cnpj} · IE {DADOS_TORG.inscricaoEstadual}</p>
              <p>{DADOS_TORG.endereco} — {DADOS_TORG.bairro}</p>
              <p>{DADOS_TORG.cidade}/{DADOS_TORG.uf} · CEP {DADOS_TORG.cep}</p>
              <p>{DADOS_TORG.telefone} · {DADOS_TORG.email}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-torg-gray">Romaneio de Expedição</p>
            <p className="text-2xl font-bold text-torg-blue leading-none mt-0.5">Nº {r.numero}</p>
            <p className="text-[11px] text-torg-gray mt-1">Data: <strong className="text-torg-dark">{fmtData(r.data)}</strong></p>
          </div>
        </div>

        {/* Dados da carga */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-4">
          <Campo label="OP" valor={r.op?.numero ? fmtOP(r.op.numero) : "—"} />
          <Campo label="Destino" valor={r.destino || "—"} destaque />
          <Campo label="Cliente" valor={r.op?.cliente || "—"} />
          <Campo label="Obra" valor={r.op?.obra || "—"} />
        </div>

        {/* Transportadora */}
        <SecTitulo>Transportadora</SecTitulo>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          <Campo label="Transportadora" valor={r.transportadora || "—"} />
          <Campo label="Motorista" valor={r.motorista || "—"} />
          <Campo label="Placa do veículo" valor={r.placaVeiculo || "—"} />
          <Campo label="Contato" valor={r.contatoTransporte || "—"} />
        </div>

        {/* Itens */}
        <SecTitulo>Itens da carga</SecTitulo>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-torg-blue/10 text-torg-dark">
              <th className="border border-gray-300 px-2 py-1 text-left w-8">#</th>
              <th className="border border-gray-300 px-2 py-1 text-left">Item</th>
              <th className="border border-gray-300 px-2 py-1 text-right w-20">Qtd</th>
              <th className="border border-gray-300 px-2 py-1 text-right w-28">Peso</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={4} className="border border-gray-300 px-2 py-3 text-center text-torg-gray">Sem itens detalhados</td></tr>
            ) : (
              itens.map((it, i) => (
                <tr key={it.id}>
                  <td className="border border-gray-300 px-2 py-1 text-torg-gray">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">{it.descricao}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right tabular-nums">{(it.qtd || 0).toLocaleString("pt-BR")}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right tabular-nums">{fmtKg(it.pesoKg)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold text-torg-dark">
              <td className="border border-gray-300 px-2 py-1.5" colSpan={2}>Total</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{totalUn.toLocaleString("pt-BR")} un</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{fmtKg(totalKg)}</td>
            </tr>
          </tfoot>
        </table>

        {/* NF + observação */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-4">
          <Campo label="Nota fiscal" valor={r.nfNumero ? `Nº ${r.nfNumero}` : NF_LABEL[r.nfStatus] || "Pendente"} destaque={r.nfStatus === "EMITIDA"} />
          <Campo label="Peso total da carga" valor={fmtKg(totalKg)} />
        </div>
        {r.observacao && (
          <div className="mt-3">
            <p className="text-[9px] uppercase tracking-wide text-torg-gray font-semibold">Observações</p>
            <p className="text-[11px] mt-0.5 whitespace-pre-wrap">{r.observacao}</p>
          </div>
        )}

        {/* Assinaturas */}
        <div className="grid grid-cols-3 gap-6 mt-12">
          {["Responsável pela Expedição", "Motorista / Transportadora", "Recebedor (data e assinatura)"].map((l) => (
            <div key={l} className="text-center">
              <div className="border-t border-torg-dark pt-1 text-[10px] text-torg-gray">{l}</div>
            </div>
          ))}
        </div>

        <p className="text-[8px] text-gray-400 text-center mt-8">
          Documento interno de expedição — Torg Metal. Não substitui a Nota Fiscal.
        </p>
      </div>
    </div>
  );
}

function Campo({ label, valor, destaque }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-wide text-torg-gray font-semibold whitespace-nowrap">{label}:</span>
      <span className={`text-[12px] ${destaque ? "font-bold text-torg-blue" : "font-medium text-torg-dark"}`}>{valor}</span>
    </div>
  );
}

function SecTitulo({ children }) {
  return (
    <p className="text-[10px] uppercase tracking-wide font-bold text-torg-dark bg-gray-100 px-2 py-1 mt-4 mb-2 rounded print:bg-gray-100">
      {children}
    </p>
  );
}
