// Componente de skeleton reutilizável para loading states
// Usado nos loading.js de cada módulo

export function SkeletonLine({ w = "full", h = 4 }) {
  const width = w === "full" ? "w-full" : w === "3/4" ? "w-3/4" : w === "1/2" ? "w-1/2" : w === "1/4" ? "w-1/4" : "w-full";
  const height = `h-${h}`;
  return <div className={`${width} ${height} bg-gray-200 rounded animate-pulse`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
      <SkeletonLine w="1/2" h={4} />
      <SkeletonLine w="full" h={3} />
      <SkeletonLine w="3/4" h={3} />
    </div>
  );
}

export function SkeletonTable({ rows = 8, cols = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50/60 px-4 py-3 flex gap-4 border-b border-gray-100">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="flex-1 h-3 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className={`flex-1 h-3 bg-gray-100 rounded animate-pulse`}
                style={{ animationDelay: `${(i * cols + j) * 30}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonKpiCards({ n = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
          <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse" />
          <div className="h-7 w-2/3 bg-gray-200 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// Tela de loading com logo Torg em fade — usada nos loading.js de cada módulo
export function TorgLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] select-none pointer-events-none">
      <img
        src="/torg-logo.png"
        alt="Carregando…"
        className="w-44 animate-logo-fade"
        draggable={false}
      />
    </div>
  );
}

export default function LoadingPage({ titulo = "", kpis = 0, linhas = 8 }) {
  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          {titulo
            ? <h1 className="text-2xl font-bold text-torg-dark">{titulo}</h1>
            : <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          }
          <div className="h-3 w-64 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
      </div>

      {/* KPI cards opcionais */}
      {kpis > 0 && <SkeletonKpiCards n={kpis} />}

      {/* Tabela */}
      <SkeletonTable rows={linhas} />
    </div>
  );
}
