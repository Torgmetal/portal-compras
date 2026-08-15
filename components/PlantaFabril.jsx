// Estrutura da fábrica no portal do cliente/auditor.
// Modo 3D (padrão): modelo interativo dos galpões — iframe do asset self-contained em
// /public/estrutura-3d/galpoes.html (Three.js embutido, roda offline). Modo 2D: planta
// ilustrativa (SVG) como alternativa/fallback (WebGL indisponível, visão rápida).
// Galpão 01 (Produção) | cabine de Jato lateral | Galpão 02 (Pintura). Metragens + fluxo.
"use client";
import { useState } from "react";
import { ArrowRight, Box, Map } from "lucide-react";

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

// zonas internas dos galpões (o Jato é um bloco lateral à parte, desenhado separado)
const Z = (x, y, w, h, nome, fill, tcor) => ({ x, y, w, h, nome, fill, tcor });
const ZONAS = [
  Z(34, 64, 238, 84, "PREPARAÇÃO", "#e6f1fb", "#0c447c"),
  Z(34, 156, 114, 110, "MONTAGEM", "#eaeefb", "#3c3489"),
  Z(158, 156, 114, 110, "SOLDA", "#fdeee6", "#993c1d"),
  Z(368, 64, 236, 84, "EXPEDIÇÃO", "#e8f5ee", "#0f6e56"),
  Z(368, 156, 236, 110, "PINTURA", "#efe8fb", "#3c3489"),
];

export default function PlantaFabril() {
  const [modo, setModo] = useState("3d"); // "3d" | "2d"
  const btn = (ativo) =>
    `inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition ${ativo ? "bg-torg-blue text-white shadow-sm" : "text-torg-gray hover:text-torg-dark"}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h2 className="text-xl font-bold text-torg-dark">Nossa estrutura fabril</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-0.5 text-[12px] font-semibold">
            <button type="button" onClick={() => setModo("3d")} className={btn(modo === "3d")}><Box size={13} /> 3D</button>
            <button type="button" onClick={() => setModo("2d")} className={btn(modo === "2d")}><Map size={13} /> Planta 2D</button>
          </div>
          <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{AREA_TOTAL} construídos</span>
        </div>
      </div>
      <p className="text-[13px] text-torg-gray mb-5">Layout dos galpões e áreas de processo.</p>

      {modo === "3d" ? (
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
      ) : (
        <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-4 sm:p-6 overflow-x-auto">
          <svg viewBox="0 0 640 318" className="w-full" style={{ minWidth: 520 }} role="img" aria-label="Planta da fábrica Torg Metal">
            {/* galpões */}
            <rect x="22" y="48" width="262" height="230" rx="6" fill="#ffffff" stroke="#002945" strokeWidth="2" />
            <rect x="356" y="48" width="260" height="230" rx="6" fill="#ffffff" stroke="#002945" strokeWidth="2" />

            {/* cabine de JATO — bloco lateral próprio, entre os galpões */}
            <rect x="296" y="78" width="48" height="170" rx="5" fill="#eef1f5" stroke="#5f5e5a" strokeWidth="1.5" />
            <text x="320" y="167" textAnchor="middle" fontSize="11" fontWeight="700" fill="#444441" fontFamily="Arial" transform="rotate(-90 320 167)">JATO</text>

            {/* zonas internas */}
            {ZONAS.map((z) => (
              <g key={z.nome}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="5" fill={z.fill} />
                <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 4} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={z.tcor} fontFamily="Arial" letterSpacing="0.3">{z.nome}</text>
              </g>
            ))}

            {/* rótulos dos galpões + metragens */}
            <text x="153" y="38" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#002945" fontFamily="Arial">GALPÃO 01 · PRODUÇÃO</text>
            <text x="486" y="38" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#002945" fontFamily="Arial">GALPÃO 02 · PINTURA</text>
            <text x="153" y="300" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#006eab" fontFamily="Arial">2.767,64 m²</text>
            <text x="486" y="300" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#006eab" fontFamily="Arial">962,32 m²</text>
          </svg>
        </div>
      )}

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

      {modo === "3d" && (
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
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <div className="bg-torg-blue-50/50 rounded-xl p-3"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Galpão 01 · Produção</p><p className="text-lg font-bold text-torg-dark mt-0.5">2.767,64 m²</p><p className="text-[12px] text-torg-gray">Preparação · Montagem · Solda</p></div>
        <div className="bg-torg-blue-50/50 rounded-xl p-3"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Galpão 02 · Pintura</p><p className="text-lg font-bold text-torg-dark mt-0.5">962,32 m²</p><p className="text-[12px] text-torg-gray">Pintura · Expedição</p></div>
        <div className="bg-torg-dark rounded-xl p-3 flex flex-col justify-center"><p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wide">Área construída</p><p className="text-lg font-bold text-white mt-0.5">{AREA_TOTAL}</p></div>
      </div>
    </div>
  );
}
