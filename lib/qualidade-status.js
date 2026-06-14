// Motor de status de vigência dos documentos da Qualidade (Módulo 1).
// Status é SEMPRE calculado a partir da data de validade — nunca armazenado.
// Plano JS puro (sem server-only): usado tanto na API quanto no client.

export const CATEGORIAS_QUALIDADE = [
  { value: "MATERIAL", label: "Material (certificados)" },
  { value: "EQUIPAMENTOS", label: "Equipamentos" },
  { value: "FUNCIONARIOS", label: "Funcionários" },
  { value: "SISTEMA", label: "Sistema / Empresa" },
  { value: "TERCEIROS", label: "Terceiros / Montadora" },
];

export const CATEGORIA_LABEL = Object.fromEntries(
  CATEGORIAS_QUALIDADE.map((c) => [c.value, c.label])
);

// Limite de alerta (dias) parametrizável por categoria. Default 30; categorias
// com prazos próprios (ex.: calibração) podem ser ajustadas aqui no futuro.
export const DIAS_ALERTA_PADRAO = 30;
export const DIAS_ALERTA_CATEGORIA = {
  // EQUIPAMENTOS: 45,
};

export function diasAlertaCategoria(categoria) {
  return DIAS_ALERTA_CATEGORIA[categoria] ?? DIAS_ALERTA_PADRAO;
}

/**
 * Calcula o status de vigência de um documento.
 * @param {string|Date|null} dataValidade
 * @param {number} [diasAlerta=30] - janela de "vencendo"
 * @returns {{ key: "SEM_VALIDADE"|"VENCIDO"|"VENCENDO"|"VIGENTE", label: string, dias: number|null }}
 */
export function calcStatusValidade(dataValidade, diasAlerta = DIAS_ALERTA_PADRAO) {
  if (!dataValidade) return { key: "SEM_VALIDADE", label: "Sem validade", dias: null };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(dataValidade);
  v.setHours(0, 0, 0, 0);
  const dias = Math.ceil((v - hoje) / 86400000);
  if (dias < 0) return { key: "VENCIDO", label: `Vencido há ${Math.abs(dias)}d`, dias };
  if (dias <= diasAlerta) return { key: "VENCENDO", label: `Vence em ${dias}d`, dias };
  return { key: "VIGENTE", label: `Vigente (${dias}d)`, dias };
}

// Cores Tailwind por status (para a UI)
export const STATUS_COR = {
  SEM_VALIDADE: "bg-gray-100 text-gray-600",
  VENCIDO: "bg-red-100 text-red-700",
  VENCENDO: "bg-amber-100 text-amber-700",
  VIGENTE: "bg-emerald-100 text-emerald-700",
};
