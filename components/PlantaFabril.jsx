// Planta ilustrativa (limpa e profissional) da fábrica da Torg para o portal do cliente.
// Galpão 01 (Produção) | cabine de Jato lateral | Galpão 02 (Pintura). Metragens + fluxo.
// Os equipamentos ficam no painel "Máquinas e equipamentos" (não poluem a planta).
import { ArrowRight } from "lucide-react";

const AREA_TOTAL = "3.729,96 m²";
const FLUXO = ["Preparação", "Montagem", "Solda", "Jato", "Pintura", "Expedição"];

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
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold text-torg-dark">Nossa estrutura fabril</h2>
        <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{AREA_TOTAL} construídos</span>
      </div>
      <p className="text-[13px] text-torg-gray mb-5">Layout dos galpões e áreas de processo.</p>

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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <div className="bg-torg-blue-50/50 rounded-xl p-3"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Galpão 01 · Produção</p><p className="text-lg font-bold text-torg-dark mt-0.5">2.767,64 m²</p><p className="text-[12px] text-torg-gray">Preparação · Montagem · Solda</p></div>
        <div className="bg-torg-blue-50/50 rounded-xl p-3"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Galpão 02 · Pintura</p><p className="text-lg font-bold text-torg-dark mt-0.5">962,32 m²</p><p className="text-[12px] text-torg-gray">Pintura · Expedição</p></div>
        <div className="bg-torg-dark rounded-xl p-3 flex flex-col justify-center"><p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wide">Área construída</p><p className="text-lg font-bold text-white mt-0.5">{AREA_TOTAL}</p></div>
      </div>
    </div>
  );
}
