"use client";
import { Briefcase, Factory, HardHat, ShoppingCart, Truck, Wrench } from "lucide-react";

export const DEPT_ICONS = {
  COMERCIAL: Briefcase,
  ENGENHARIA: Wrench,
  SUPRIMENTOS: ShoppingCart,
  FABRICACAO: Factory,
  EXPEDICAO: Truck,
  MONTAGEM: HardHat,
};

export const DEPT_COLORS = {
  COMERCIAL: "text-blue-600 bg-blue-50 border-blue-200",
  ENGENHARIA: "text-purple-600 bg-purple-50 border-purple-200",
  SUPRIMENTOS: "text-amber-600 bg-amber-50 border-amber-200",
  FABRICACAO: "text-emerald-600 bg-emerald-50 border-emerald-200",
  EXPEDICAO: "text-teal-600 bg-teal-50 border-teal-200",
  MONTAGEM: "text-orange-600 bg-orange-50 border-orange-200",
};

export const DEPT_LABEL = {
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação",
  EXPEDICAO: "Expedição",
  MONTAGEM: "Montagem",
};

// Ordem fixa dos departamentos — Comercial sempre primeiro
export const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];

export const STATUS_LABEL = {
  PENDENTE: { label: "Pendente", color: "bg-gray-100 text-gray-600" },
  EM_COTACAO: { label: "Em cotação", color: "bg-amber-100 text-amber-700" },
  COTADO: { label: "Cotado", color: "bg-blue-100 text-blue-700" },
  PEDIDO_GERADO: { label: "Pedido gerado", color: "bg-emerald-100 text-emerald-700" },
};

export const SETOR_LABEL = {
  PENDENTE: "Estoque", CORTE: "Preparação", MONTAGEM: "Montagem",
  SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};

export const SETOR_COLOR = {
  PENDENTE: "bg-gray-100 text-gray-600",
  CORTE: "bg-amber-100 text-amber-700",
  MONTAGEM: "bg-blue-100 text-blue-700",
  SOLDA: "bg-orange-100 text-orange-700",
  ACABAMENTO: "bg-purple-100 text-purple-700",
  JATO: "bg-cyan-100 text-cyan-700",
  PINTURA: "bg-emerald-100 text-emerald-700",
  EXPEDIDO: "bg-green-100 text-green-700",
};

export const SETOR_ORDER = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
