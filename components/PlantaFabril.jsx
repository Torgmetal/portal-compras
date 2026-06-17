// Planta ilustrativa (elaborada) da fábrica da Torg para o portal do cliente.
// Layout dos galpões + zonas de processo com marcadores de equipamento, metragens e
// o fluxo produtivo. Bem mais clara que a planta CAD. Atende "Capacidade Fabril".
import { ArrowRight } from "lucide-react";

const AREA_TOTAL = "3.729,96 m²";
const FLUXO = ["Preparação", "Montagem", "Solda", "Jato", "Pintura", "Expedição"];

// zona: x,y,w,h em viewBox 680x380; cor de preenchimento + texto; equipamentos (chips)
const Z = (x, y, w, h, nome, fill, tcor, eqs) => ({ x, y, w, h, nome, fill, tcor, eqs });
const ZONAS = [
  Z(34, 60, 270, 104, "PREPARAÇÃO", "#e6f1fb", "#0c447c", ["Lasers Calfran (chapa/perfil/tubo)", "Oxicorte · Serra"]),
  Z(34, 172, 130, 150, "MONTAGEM", "#e1f5ee", "#0f6e56", ["3× Ponte rolante 5t"]),
  Z(172, 172, 132, 150, "SOLDA", "#faece7", "#993c1d", ["10× Solda 450A", "Braço giratório"]),
  Z(316, 60, 70, 262, "JATO", "#f1efe8", "#444441", ["Cabine 4,5×15 m", "Jato turbina"]),
  Z(398, 172, 250, 150, "PINTURA", "#eeedfe", "#3c3489", ["Linha eletrostática", "Airless · Tanques"]),
  Z(398, 60, 250, 104, "ADMINISTRATIVO", "#faeeda", "#854f0b", ["Escritórios · Recepção · Diretoria"]),
];

export default function PlantaFabril() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold text-torg-dark">Nossa estrutura fabril</h2>
        <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{AREA_TOTAL} construídos</span>
      </div>
      <p className="text-[13px] text-torg-gray mb-5">Layout dos galpões, áreas de processo e principais equipamentos.</p>

      <div className="rounded-xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white p-3 sm:p-5 overflow-x-auto">
        <svg viewBox="0 0 680 392" className="w-full" style={{ minWidth: 560 }} role="img" aria-label="Planta ilustrativa da fábrica Torg Metal">
          <defs>
            <filter id="pfsh" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#002945" floodOpacity="0.12" /></filter>
          </defs>
          {/* terreno */}
          <rect x="8" y="40" width="664" height="300" rx="10" fill="#f7f8fa" stroke="#e3e6ea" />
          {/* paredes dos galpões (profundidade) */}
          <rect x="26" y="50" width="286" height="282" rx="6" fill="#ffffff" stroke="#002945" strokeWidth="3" filter="url(#pfsh)" />
          <rect x="390" y="50" width="266" height="282" rx="6" fill="#ffffff" stroke="#002945" strokeWidth="3" filter="url(#pfsh)" />
          {/* cabine de jato entre os galpões */}
          <rect x="316" y="60" width="70" height="262" rx="5" fill="#ffffff" stroke="#5f5e5a" strokeWidth="2" strokeDasharray="4 3" />

          {/* zonas */}
          {ZONAS.map((z) => (
            <g key={z.nome}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="5" fill={z.fill} />
              <text x={z.x + z.w / 2} y={z.y + 18} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={z.tcor} fontFamily="Arial">{z.nome}</text>
              {z.eqs.map((e, i) => (
                <text key={i} x={z.x + z.w / 2} y={z.y + 36 + i * 14} textAnchor="middle" fontSize="9" fill={z.tcor} fontFamily="Arial" opacity="0.85">{e}</text>
              ))}
            </g>
          ))}

          {/* rótulos dos galpões + metragens */}
          <text x="169" y="68" textAnchor="middle" fontSize="11" fontWeight="700" fill="#002945" fontFamily="Arial">GALPÃO 01 · PRODUÇÃO</text>
          <text x="523" y="68" textAnchor="middle" fontSize="11" fontWeight="700" fill="#002945" fontFamily="Arial">GALPÃO 02 · PINTURA</text>
          {/* cotas (dimensões) */}
          <text x="169" y="350" textAnchor="middle" fontSize="11" fontWeight="700" fill="#006eab" fontFamily="Arial">2.767,64 m²</text>
          <text x="523" y="350" textAnchor="middle" fontSize="11" fontWeight="700" fill="#006eab" fontFamily="Arial">962,32 m²</text>
          {/* norte */}
          <g transform="translate(642,66)"><path d="M0,-12 L5,6 L0,1 L-5,6 Z" fill="#002945" /><text x="0" y="20" textAnchor="middle" fontSize="8" fill="#576d7e" fontFamily="Arial">N</text></g>
          {/* título da planta */}
          <text x="20" y="28" fontSize="10" fontWeight="700" fill="#576d7e" fontFamily="Arial" letterSpacing="1">PLANTA — PARQUE INDUSTRIAL TORG METAL</text>
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
        <div className="bg-torg-blue-50/50 rounded-xl p-3"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Galpão 02 · Pintura</p><p className="text-lg font-bold text-torg-dark mt-0.5">962,32 m²</p><p className="text-[12px] text-torg-gray">Jato · Pintura · Administrativo</p></div>
        <div className="bg-torg-dark rounded-xl p-3 flex flex-col justify-center"><p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wide">Área construída</p><p className="text-lg font-bold text-white mt-0.5">{AREA_TOTAL}</p></div>
      </div>
    </div>
  );
}
