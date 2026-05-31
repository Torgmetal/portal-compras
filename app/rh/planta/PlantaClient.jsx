"use client";
import { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, Users, MapPin } from "lucide-react";

// ─── Mapeamento setor → área física ─────────────────────────────────────────────
const SETOR_MAP = {
  "Preparação": "preparacao",
  "Jato": "jato",
  "Montagem Interna": "montagem",
  "Montagem Externa": "montagem",
  "Solda": "solda",
  "Pintura": "pintura",
  "Expedição": "expedicao",
  "Almoxarifado": "almoxarifado",
  "Almoxarife": "almoxarifado",
  "Qualidade": "qualidade",
  "Manutenção": "manutencao",
  "PCP": "pcp",
  "SESMT": "pcp",
};

// ─── Definição das áreas físicas (coordenadas SVG + estilo) ─────────────────────
const AREAS = [
  {
    id: "preparacao",
    label: "Preparação",
    rects: [
      { x: 30, y: 30, w: 380, h: 180 },
      { x: 430, y: 30, w: 400, h: 180 },
    ],
    cor: "rgba(59,130,246,1)",
    fill: "rgba(59,130,246,0.15)",
    stroke: "#3b82f6",
  },
  {
    id: "montagem",
    label: "Montagem",
    rects: [{ x: 30, y: 230, w: 400, h: 240 }],
    cor: "rgba(16,185,129,1)",
    fill: "rgba(16,185,129,0.15)",
    stroke: "#10b981",
  },
  {
    id: "solda",
    label: "Solda",
    rects: [{ x: 450, y: 230, w: 380, h: 240 }],
    cor: "rgba(245,158,11,1)",
    fill: "rgba(245,158,11,0.15)",
    stroke: "#f59e0b",
  },
  {
    id: "pintura",
    label: "Pintura",
    rects: [{ x: 870, y: 20, w: 310, h: 340 }],
    cor: "rgba(168,85,247,1)",
    fill: "rgba(168,85,247,0.15)",
    stroke: "#a855f7",
  },
  {
    id: "jato",
    label: "Jato",
    rects: [{ x: 20, y: 500, w: 180, h: 130 }],
    cor: "rgba(99,102,241,1)",
    fill: "rgba(99,102,241,0.15)",
    stroke: "#6366f1",
  },
  {
    id: "almoxarifado",
    label: "Almoxarifado",
    rects: [{ x: 220, y: 500, w: 220, h: 130 }],
    cor: "rgba(20,184,166,1)",
    fill: "rgba(20,184,166,0.15)",
    stroke: "#14b8a6",
  },
  {
    id: "expedicao",
    label: "Expedição",
    rects: [{ x: 460, y: 500, w: 220, h: 130 }],
    cor: "rgba(244,63,94,1)",
    fill: "rgba(244,63,94,0.15)",
    stroke: "#f43f5e",
  },
  {
    id: "qualidade",
    label: "Qualidade",
    rects: [{ x: 700, y: 500, w: 160, h: 130 }],
    cor: "rgba(34,197,94,1)",
    fill: "rgba(34,197,94,0.15)",
    stroke: "#22c55e",
  },
  {
    id: "manutencao",
    label: "Manutenção",
    rects: [{ x: 880, y: 380, w: 150, h: 100 }],
    cor: "rgba(251,146,60,1)",
    fill: "rgba(251,146,60,0.15)",
    stroke: "#fb923c",
  },
  {
    id: "pcp",
    label: "PCP / SESMT",
    rects: [{ x: 1050, y: 380, w: 130, h: 100 }],
    cor: "rgba(148,163,184,1)",
    fill: "rgba(148,163,184,0.15)",
    stroke: "#94a3b8",
  },
];

// ─── Utilitário: posicionar funcionários dentro de um retângulo ─────────────────
function posicionarFuncionarios(areaRect, funcionarios) {
  if (!funcionarios.length) return [];
  const cols = Math.ceil(Math.sqrt(funcionarios.length));
  const rows = Math.ceil(funcionarios.length / cols);
  const paddingX = 30;
  const paddingY = 30;
  const stepX = (areaRect.w - paddingX * 2) / Math.max(cols, 1);
  const stepY = (areaRect.h - paddingY * 2) / Math.max(rows, 1);

  return funcionarios.map((f, i) => ({
    ...f,
    cx: areaRect.x + paddingX + (i % cols) * stepX + stepX / 2,
    cy: areaRect.y + paddingY + Math.floor(i / cols) * stepY + stepY / 2,
  }));
}

// ─── Mapear nome do setor para id da área ───────────────────────────────────────
function mapearSetor(nomeSetor) {
  if (!nomeSetor) return null;
  const nome = nomeSetor.trim();
  // Busca direta
  if (SETOR_MAP[nome]) return SETOR_MAP[nome];
  // Busca parcial (case-insensitive)
  const lower = nome.toLowerCase();
  for (const [key, value] of Object.entries(SETOR_MAP)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return value;
    }
  }
  return null;
}

// ─── Componente principal ────────────────────────────────────────────────────────
export default function PlantaClient() {
  const [funcionarios, setFuncionarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [areaHover, setAreaHover] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // Fetch funcionários
  useEffect(() => {
    fetch("/api/rh/funcionarios")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success && d.error) throw new Error(d.error);
        setFuncionarios(d.data || []);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  // Agrupar funcionários por área
  const porArea = useMemo(() => {
    const grupos = { outros: [] };
    AREAS.forEach((a) => (grupos[a.id] = []));

    funcionarios
      .filter((f) => f.status !== "INATIVO")
      .forEach((f) => {
        const nomeSetor = f.setor?.nome || "";
        const areaId = mapearSetor(nomeSetor);
        if (areaId && grupos[areaId]) {
          grupos[areaId].push(f);
        } else {
          grupos.outros.push(f);
        }
      });

    return grupos;
  }, [funcionarios]);

  // Total ativos
  const totalAtivos = useMemo(
    () => funcionarios.filter((f) => f.status !== "INATIVO").length,
    [funcionarios]
  );

  // Handler de tooltip (posição relativa ao container SVG)
  function handleDotHover(e, func) {
    const svgContainer = e.currentTarget.closest(".planta-svg-container");
    if (!svgContainer) return;
    const rect = svgContainer.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 10,
      nome: func.nome,
      cargo: func.cargo?.nome || "—",
    });
  }

  // ─── Loading ──────────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando mapa da
        fábrica…
      </div>
    );
  }

  // ─── Erro ─────────────────────────────────────────────────────────────────────
  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
        <AlertCircle size={16} /> {erro}
      </div>
    );
  }

  // ─── Área selecionada (detalhes) ──────────────────────────────────────────────
  const areaSelecionada = selectedArea
    ? AREAS.find((a) => a.id === selectedArea)
    : null;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <MapPin size={22} className="text-torg-blue" />
            Mapa da Fábrica
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Localização dos funcionários por setor — clique em uma área para ver
            detalhes
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-2">
          <Users size={16} className="text-torg-blue" />
          <span className="text-sm font-semibold text-torg-dark">
            {totalAtivos}
          </span>
          <span className="text-sm text-torg-gray">funcionários ativos</span>
        </div>
      </div>

      {/* SVG Map */}
      <div className="planta-svg-container bg-[#0a1628] rounded-2xl shadow-lg border border-gray-700 overflow-hidden relative">
        <svg
          viewBox="0 0 1200 650"
          className="w-full h-auto"
          style={{ minHeight: 350 }}
        >
          {/* Grid lines (blueprint effect) */}
          <defs>
            <pattern
              id="gridPattern"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(59,130,246,0.06)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="1200" height="650" fill="url(#gridPattern)" />

          {/* Galpão 01 — Produção (main building outline) */}
          <rect
            x={20}
            y={20}
            width={820}
            height={460}
            fill="#0f2240"
            stroke="#3b82f6"
            strokeWidth={2}
            rx={3}
          />
          {/* Galpão 02 — Pintura (outline) */}
          <rect
            x={870}
            y={20}
            width={310}
            height={340}
            fill="#0f2240"
            stroke="#3b82f6"
            strokeWidth={2}
            rx={3}
          />

          {/* Building labels */}
          <text
            x={430}
            y={225}
            textAnchor="middle"
            fill="rgba(59,130,246,0.3)"
            fontSize={14}
            fontWeight="bold"
            letterSpacing={2}
          >
            GALPÃO 01 — PRODUÇÃO
          </text>
          <text
            x={1025}
            y={200}
            textAnchor="middle"
            fill="rgba(168,85,247,0.3)"
            fontSize={12}
            fontWeight="bold"
            letterSpacing={2}
          >
            GALPÃO 02 — PINTURA
          </text>

          {/* Area rectangles */}
          {AREAS.map((area) =>
            area.rects.map((rect, ri) => {
              const isHovered = areaHover === area.id;
              const isSelected = selectedArea === area.id;
              const fillOpacity = isHovered || isSelected ? 0.3 : 0.15;
              const areaColor = area.stroke;
              const computedFill = area.fill.replace(
                "0.15)",
                `${fillOpacity})`
              );

              return (
                <g key={`${area.id}-${ri}`}>
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    fill={computedFill}
                    stroke={areaColor}
                    strokeWidth={isHovered || isSelected ? 2 : 1}
                    strokeDasharray={isSelected ? "none" : "4 2"}
                    rx={2}
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setAreaHover(area.id)}
                    onMouseLeave={() => setAreaHover(null)}
                    onClick={() =>
                      setSelectedArea(
                        selectedArea === area.id ? null : area.id
                      )
                    }
                  />
                  {/* Area label */}
                  <text
                    x={rect.x + rect.w / 2}
                    y={rect.y + 18}
                    textAnchor="middle"
                    fill="white"
                    fontSize={10}
                    fontWeight="bold"
                    letterSpacing={1}
                    opacity={0.9}
                    className="pointer-events-none uppercase"
                  >
                    {area.label}
                    {area.rects.length > 1 ? ` ${ri + 1}` : ""}
                  </text>
                  {/* Count badge */}
                  {ri === 0 && (
                    <g className="pointer-events-none">
                      <rect
                        x={rect.x + rect.w - 36}
                        y={rect.y + 6}
                        width={28}
                        height={18}
                        rx={9}
                        fill={areaColor}
                        opacity={0.9}
                      />
                      <text
                        x={rect.x + rect.w - 22}
                        y={rect.y + 19}
                        textAnchor="middle"
                        fill="white"
                        fontSize={10}
                        fontWeight="bold"
                      >
                        {porArea[area.id]?.length || 0}
                      </text>
                    </g>
                  )}
                </g>
              );
            })
          )}

          {/* Employee dots */}
          {AREAS.map((area) => {
            const funcsArea = porArea[area.id] || [];
            if (!funcsArea.length) return null;

            // Distribuir funcionários proporcionalmente entre os rects da área
            const totalRects = area.rects.length;
            const perRect = Math.ceil(funcsArea.length / totalRects);

            return area.rects.map((rect, ri) => {
              const sliceStart = ri * perRect;
              const sliceEnd = Math.min(sliceStart + perRect, funcsArea.length);
              const funcsSlice = funcsArea.slice(sliceStart, sliceEnd);
              const positioned = posicionarFuncionarios(rect, funcsSlice);

              return positioned.map((func) => (
                <circle
                  key={func.id}
                  cx={func.cx}
                  cy={func.cy}
                  r={6}
                  fill={area.stroke}
                  stroke="white"
                  strokeWidth={1.5}
                  opacity={0.9}
                  className="cursor-pointer transition-all duration-150 hover:r-8"
                  style={{ filter: areaHover === area.id ? "brightness(1.3)" : "none" }}
                  onMouseEnter={(e) => handleDotHover(e, func)}
                  onMouseMove={(e) => handleDotHover(e, func)}
                  onMouseLeave={() => setTooltip(null)}
                />
              ));
            });
          })}
        </svg>

        {/* Tooltip overlay */}
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-white rounded-lg shadow-lg px-3 py-2 text-sm z-50 border border-gray-100"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(0, -100%)",
            }}
          >
            <p className="font-bold text-torg-dark">{tooltip.nome}</p>
            <p className="text-torg-gray text-xs">{tooltip.cargo}</p>
          </div>
        )}
      </div>

      {/* Selected Area Detail Panel */}
      {areaSelecionada && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-torg-dark flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: areaSelecionada.stroke }}
              />
              {areaSelecionada.label}
              <span className="text-sm font-normal text-torg-gray ml-2">
                ({porArea[selectedArea]?.length || 0} funcionários)
              </span>
            </h3>
            <button
              onClick={() => setSelectedArea(null)}
              className="text-sm text-torg-gray hover:text-torg-dark transition-colors"
            >
              Fechar
            </button>
          </div>

          {porArea[selectedArea]?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/60 text-left">
                    <th className="px-3 py-2 font-semibold text-torg-dark">
                      Nome
                    </th>
                    <th className="px-3 py-2 font-semibold text-torg-dark">
                      Cargo
                    </th>
                    <th className="px-3 py-2 font-semibold text-torg-dark">
                      Setor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {porArea[selectedArea].map((func) => (
                    <tr key={func.id} className="hover:bg-gray-50/40">
                      <td className="px-3 py-2 text-torg-dark font-medium">
                        {func.nome}
                      </td>
                      <td className="px-3 py-2 text-torg-gray">
                        {func.cargo?.nome || "—"}
                      </td>
                      <td className="px-3 py-2 text-torg-gray">
                        {func.setor?.nome || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-torg-gray italic">
              Nenhum funcionário cadastrado neste setor.
            </p>
          )}
        </div>
      )}

      {/* "Outros" — funcionários sem setor mapeado */}
      {porArea.outros?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-lg font-bold text-torg-dark mb-3">
            Funcionários sem setor mapeado
            <span className="text-sm font-normal text-torg-gray ml-2">
              ({porArea.outros.length})
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 text-left">
                  <th className="px-3 py-2 font-semibold text-torg-dark">
                    Nome
                  </th>
                  <th className="px-3 py-2 font-semibold text-torg-dark">
                    Cargo
                  </th>
                  <th className="px-3 py-2 font-semibold text-torg-dark">
                    Setor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {porArea.outros.map((func) => (
                  <tr key={func.id} className="hover:bg-gray-50/40">
                    <td className="px-3 py-2 text-torg-dark font-medium">
                      {func.nome}
                    </td>
                    <td className="px-3 py-2 text-torg-gray">
                      {func.cargo?.nome || "—"}
                    </td>
                    <td className="px-3 py-2 text-torg-gray">
                      {func.setor?.nome || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {AREAS.map((area) => (
          <div
            key={area.id}
            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
            onClick={() =>
              setSelectedArea(selectedArea === area.id ? null : area.id)
            }
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: area.stroke }}
            />
            <span className="text-torg-dark truncate">{area.label}</span>
            <span className="text-gray-400 ml-auto text-xs font-medium">
              {porArea[area.id]?.length || 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
