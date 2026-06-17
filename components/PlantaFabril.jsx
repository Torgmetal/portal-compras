// Planta ilustrativa da fábrica da Torg para o portal do cliente (auditoria).
// Esquemática e limpa — bem mais clara que a planta CAD. As metragens vêm do
// objeto FABRIL (atualizável conforme o Vitor confirmar as áreas).
const FABRIL = {
  areaTotal: "3.729,96 m²",
  galpoes: [
    {
      nome: "GALPÃO 01 · PRODUÇÃO", m2: "2.767,64 m²", piso: "Piso de concreto",
      zonas: [
        { n: "PREPARAÇÃO", x: 18, y: 30, w: 314, h: 96, c: "#e6f1fb", t: "#0c447c" },
        { n: "MONTAGEM", x: 18, y: 132, w: 152, h: 120, c: "#e1f5ee", t: "#0f6e56" },
        { n: "SOLDA", x: 176, y: 132, w: 156, h: 120, c: "#faece7", t: "#993c1d" },
      ],
    },
    {
      nome: "GALPÃO 02 · PINTURA", m2: "962,32 m²", piso: "Piso de concreto",
      zonas: [
        { n: "ADMINISTRATIVO", x: 350, y: 30, w: 150, h: 70, c: "#faeeda", t: "#854f0b" },
        { n: "PINTURA", x: 350, y: 106, w: 150, h: 146, c: "#eeedfe", t: "#3c3489" },
      ],
    },
  ],
  // Áreas da "Capacidade Fabril" (GQ-FQ-003) — preencher metragens reais quando confirmadas.
  areas: [
    { nome: "Cabine de jateamento", m2: null },
    { nome: "Cabine de pintura", m2: null },
    { nome: "Recebimento / Armazenagem", m2: null },
    { nome: "Pré-montagem", m2: null },
    { nome: "Ensaios e testes", m2: null },
    { nome: "Embalagem / Expedição", m2: null },
  ],
};

export default function PlantaFabril() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold text-torg-dark">Nossa estrutura fabril</h2>
        <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{FABRIL.areaTotal} construídos</span>
      </div>
      <p className="text-[13px] text-torg-gray mb-5">Layout dos galpões e áreas de processo.</p>

      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 sm:p-4 overflow-x-auto">
        <svg viewBox="0 0 520 280" className="w-full" style={{ minWidth: 440 }} role="img" aria-label="Planta da fábrica Torg Metal">
          {/* Galpão 01 */}
          <rect x="14" y="22" width="324" height="240" rx="6" fill="#ffffff" stroke="#002945" strokeWidth="2" />
          {/* Galpão 02 */}
          <rect x="346" y="22" width="160" height="240" rx="6" fill="#ffffff" stroke="#002945" strokeWidth="2" />
          {FABRIL.galpoes.flatMap((g) => g.zonas).map((z) => (
            <g key={z.n}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="4" fill={z.c} />
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 3} textAnchor="middle" fontSize="11" fontWeight="600" fill={z.t} fontFamily="Arial">{z.n}</text>
            </g>
          ))}
          {/* rótulos dos galpões */}
          <text x="176" y="16" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#002945" fontFamily="Arial">GALPÃO 01 · PRODUÇÃO — 2.767,64 m²</text>
          <text x="426" y="16" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#002945" fontFamily="Arial">GALPÃO 02 — 962,32 m²</text>
        </svg>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        {FABRIL.galpoes.map((g) => (
          <div key={g.nome} className="bg-torg-blue-50/50 rounded-xl p-3">
            <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">{g.nome}</p>
            <p className="text-lg font-bold text-torg-dark mt-0.5">{g.m2}</p>
            <p className="text-[12px] text-torg-gray">{g.piso}</p>
          </div>
        ))}
        <div className="bg-torg-dark rounded-xl p-3 flex flex-col justify-center">
          <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wide">Área construída</p>
          <p className="text-lg font-bold text-white mt-0.5">{FABRIL.areaTotal}</p>
        </div>
      </div>

      {FABRIL.areas.some((a) => a.m2) && (
        <div className="flex flex-wrap gap-2 mt-4">
          {FABRIL.areas.filter((a) => a.m2).map((a) => (
            <span key={a.nome} className="text-[12px] text-torg-dark bg-gray-50 border border-gray-100 rounded-full px-3 py-1">{a.nome}: <strong>{a.m2}</strong></span>
          ))}
        </div>
      )}
    </div>
  );
}
