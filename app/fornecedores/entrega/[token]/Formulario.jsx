"use client";

// As duas respostas que o fornecedor pode dar no portal público: informar uma nova previsão de
// entrega, ou declarar que o pedido já foi entregue e passar o número da nota.
import CampoData from "@/components/CampoData";
import { Loader2, AlertCircle, CalendarDays, FileText } from "lucide-react";

/**
 * ⚠ Em arquivo próprio desde 18/09/2026: com a aba de entrega o `EntregaFornecedorForm` passou do
 * teto de 350 linhas, e ele já estourava o de linhas por função antes disso.
 */
export default function Formulario({ estado }) {
  const { aba, setAba, entregueAba, novoPrazo, setNovoPrazo, nfNumero, setNfNumero,
    motivo, setMotivo, erroEnvio, setErroEnvio, enviando, enviar } = estado;
  return (
    <>
    {/* Formulario */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ⚠ A escolha vem ANTES dos campos: quem já entregou não deve ter de olhar um seletor de
          data para descobrir que existe outro caminho. */}
      <div className="grid grid-cols-2 border-b border-gray-100">
        {[
          ["previsao", "Informar nova previsao", CalendarDays],
          ["entregue", "Ja foi entregue", FileText],
        ].map(([chave, rotulo, Icone]) => (
          <button key={chave} type="button"
            onClick={() => { setAba(chave); setErroEnvio(""); }}
            className={`px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
              aba === chave
                ? "bg-torg-blue text-white"
                : "bg-white text-torg-gray hover:bg-gray-50"}`}>
            <Icone size={15} /> {rotulo}
          </button>
        ))}
      </div>
      <div className="px-6 py-4 space-y-4">
        {entregueAba ? (
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Numero da nota fiscal *
            </label>
            <input
              type="text" inputMode="numeric" value={nfNumero} maxLength={40}
              onChange={(e) => setNfNumero(e.target.value)}
              placeholder="Ex: 000362322"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
            />
            {/* ⚠ Diz o que vai acontecer de verdade: a Torg confere. Sem isso, o fornecedor
                entende que o pedido foi baixado e para de acompanhar. */}
            <p className="text-xs text-torg-gray mt-2">
              A equipe de Compras sera avisada e vai conferir o recebimento com a nota.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Data prevista de entrega *
            </label>
            <CampoData
              value={novoPrazo}
              onChange={(iso) => setNovoPrazo(iso)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">
            Observacao <span className="font-normal text-torg-gray">(opcional)</span>
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={entregueAba
              ? "Ex: Entregue no pátio dia 15, recebido por João"
              : "Ex: Material em transito, previsao de chegada na proxima semana"}
            rows={3}
            maxLength={500}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
          />
        </div>

        {erroEnvio && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertCircle size={14} /> {erroEnvio}
          </div>
        )}

        <button
          onClick={enviar}
          disabled={enviando || (entregueAba ? !nfNumero.trim() : !novoPrazo)}
          className="w-full py-3 bg-torg-blue text-white text-sm font-semibold rounded-lg hover:bg-torg-blue/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {enviando ? (
            <><Loader2 size={16} className="animate-spin" /> Enviando...</>
          ) : entregueAba ? (
            <><FileText size={16} /> Informar que ja foi entregue</>
          ) : (
            <><CalendarDays size={16} /> Confirmar previsao de entrega</>
          )}
        </button>
      </div>
    </div>
    </>
  );
}

