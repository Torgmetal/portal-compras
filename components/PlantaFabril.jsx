// Estrutura da fábrica no portal do cliente/auditor: modelo 3D interativo dos galpões
// (iframe do asset self-contained em /public/estrutura-3d/galpoes.html, Three.js embutido,
// roda offline) + Fluxo produtivo + Setores de produção (cores idênticas à cena) + metragens.
"use client";
import { ArrowRight } from "lucide-react";

const AREA_TOTAL = "3.729,96 m²";
const FLUXO = ["Preparação", "Montagem", "Solda", "Jato", "Pintura", "Expedição"];
const ESTRUTURA_3D = "/estrutura-3d/galpoes.html";
// Setores de produção — cores idênticas à legenda do modelo 3D. Descritos abaixo do
// modelo (chips) pra o auditor ler o código de cores fora da cena.
const SETORES = [
  { nome: "Preparação", cor: "#aec1d1" },
  { nome: "Montagem", cor: "#8ea9c2" },
  { nome: "Solda", cor: "#5980a6" },
  { nome: "Usinagem", cor: "#9aacbb" },
  { nome: "Pintura / jateamento", cor: "#c6c8c9" },
  { nome: "Expedição", cor: "#7593b3" },
  { nome: "Anexos / cabines", cor: "#b4b0aa" },
  { nome: "Ponte rolante", cor: "#e8b02a" },
];

export default function PlantaFabril() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h2 className="text-xl font-bold text-torg-dark">Nossa estrutura fabril</h2>
        <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{AREA_TOTAL} construídos</span>
      </div>
      <p className="text-[13px] text-torg-gray mb-5">Layout dos galpões e áreas de processo.</p>

      <div className="relative rounded-xl border border-gray-100 overflow-hidden bg-[#faf9f5]">
        <iframe
          src={ESTRUTURA_3D}
          title="Estrutura 3D — Torg Metal"
          loading="lazy"
          allow="fullscreen"
          className="w-full h-[440px] sm:h-[560px] block border-0"
        />
        <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-torg-gray bg-white/85 rounded-full px-2.5 py-0.5 shadow-sm">
          Arraste para girar · role para dar zoom
        </span>
      </div>

      {/* fluxo produtivo */}
      <div className="flex items-center flex-wrap gap-1.5 mt-4">
        <span className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mr-1">Fluxo:</span>
        {FLUXO.map((f, i) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-torg-dark bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1">{f}</span>
            {i < FLUXO.length - 1 && <ArrowRight size={13} className="text-torg-orange" />}
          </span>
        ))}
      </div>

      {/* setores de produção — código de cores do modelo 3D */}
      <div className="mt-3">
        <span className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Setores de produção</span>
        <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
          {SETORES.map((s) => (
            <span key={s.nome} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-torg-dark bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.cor }} /> {s.nome}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <div className="bg-torg-blue-50/50 rounded-xl p-3"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Galpão 01 · Produção</p><p className="text-lg font-bold text-torg-dark mt-0.5">2.767,64 m²</p><p className="text-[12px] text-torg-gray">Preparação · Montagem · Solda</p></div>
        <div className="bg-torg-blue-50/50 rounded-xl p-3"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Galpão 02 · Pintura</p><p className="text-lg font-bold text-torg-dark mt-0.5">962,32 m²</p><p className="text-[12px] text-torg-gray">Pintura · Expedição</p></div>
        <div className="bg-torg-dark rounded-xl p-3 flex flex-col justify-center"><p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wide">Área construída</p><p className="text-lg font-bold text-white mt-0.5">{AREA_TOTAL}</p></div>
      </div>
    </div>
  );
}
