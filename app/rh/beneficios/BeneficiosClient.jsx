"use client";
import { Heart } from "lucide-react";

export default function BeneficiosClient() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Beneficios</h2>
        <p className="text-sm text-torg-gray mt-1">Gestao de VT, VR, plano de saude e mais</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <Heart size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-torg-gray text-lg font-medium">Em construcao</p>
        <p className="text-xs text-torg-gray mt-2">Esta funcionalidade sera implementada em breve.</p>
      </div>
    </div>
  );
}
