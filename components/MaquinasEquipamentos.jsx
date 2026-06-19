// Relação de máquinas e equipamentos da Torg (REL-EQUIP-001) para o portal do cliente.
// Atende o item "Máquinas e Equipamentos" do GQ-FQ-003. Dados atualizáveis aqui.
import { Cog, Boxes } from "lucide-react";

const SETORES = [
  { nome: "Preparação", itens: [
    { q: 3, d: "Ponte Rolante", m: "Ferro Indústria / Martins", cap: "5 ton" },
    { q: 1, d: "Laser de Corte de Perfis e Tubos", m: "Calfran", cap: "6.000 kW", obs: "Tubos e perfis de 3/8\" a 20\"" },
    { q: 1, d: "Laser de Corte para Perfis", m: "Calfran", cap: "12.000 kW", obs: "Perfis de 150 a 1.500 mm" },
    { q: 1, d: "Laser de Corte de Chapa", m: "Calfran", cap: "12.000 kW", obs: "Chapas 2.200×6.000 mm, até 38 mm" },
    { q: 1, d: "Laser de Corte para Cantoneiras", m: "Calfran", cap: "3.000 kW", obs: "Perfis L de 1/4\" a 6\"" },
    { q: 1, d: "Central de Oxicorte", m: "Peddinghaus", cap: "1.500 mm", obs: "Perfis de 150 a 1.500 mm" },
    { q: 1, d: "Serra Fita", m: "Franho", cap: "500 mm" },
    { q: 1, d: "Empilhadeira", m: "Clark", cap: "2,5 ton" },
  ] },
  { nome: "Solda e Montagem", itens: [
    { q: 10, d: "Máquinas de Solda 450 A", m: "Marcas diversas", cap: "450 A" },
    { q: 3, d: "Ponte Rolante", m: "Ferro Indústria", cap: "5 ton" },
    { q: 2, d: "Braço Giratório", m: "Ferro Indústria", cap: "3 ton" },
  ] },
  { nome: "Jato", itens: [
    { q: 1, d: "Cabine de Jato com central de exaustão", m: "Polo Ar", obs: "4,5 × 15 m" },
    { q: 1, d: "Cabine de Jato de Turbina (4 turbinas)", m: "Pangborn", obs: "Peças até 500 × 2.150 mm" },
  ] },
  { nome: "Pintura", itens: [
    { q: 1, d: "Linha de Pintura Eletrostática Líquida", m: "Graco" },
    { q: 1, d: "Airless 70×1", m: "Graco" },
    { q: 3, d: "Tanques de Pintura", m: "—" },
  ] },
  { nome: "Estoque e Expedição", itens: [
    { q: 1, d: "Ponte Rolante", m: "Ferro Indústria", cap: "5 ton" },
    { q: 1, d: "Empilhadeira", m: "Movis", cap: "4 ton" },
  ] },
];
const TOTAL = SETORES.reduce((s, g) => s + g.itens.reduce((a, i) => a + i.q, 0), 0);

export default function MaquinasEquipamentos() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold text-torg-dark inline-flex items-center gap-2"><Cog size={20} className="text-torg-blue" /> Máquinas e equipamentos</h2>
        <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1 inline-flex items-center gap-1.5"><Boxes size={14} /> {TOTAL} unidades</span>
      </div>
      <p className="text-[13px] text-torg-gray mb-5">Parque industrial por setor (REL-EQUIP-001).</p>

      <div className="space-y-5">
        {SETORES.map((g) => (
          <div key={g.nome}>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-torg-orange shrink-0" />
              <h3 className="text-[13px] font-semibold text-torg-dark uppercase tracking-wide whitespace-nowrap">{g.nome}</h3>
              <span className="h-px bg-gray-100 flex-1" />
            </div>
            <div className="space-y-1.5">
              {g.itens.map((it, i) => (
                <div key={i} className="flex items-start gap-3 border border-gray-100 rounded-xl px-3.5 py-2.5">
                  <span className="text-[13px] font-bold text-torg-blue bg-torg-blue-50 rounded-lg px-2 py-0.5 shrink-0 min-w-[34px] text-center">{it.q}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-torg-dark leading-snug">{it.d}</p>
                    <p className="text-[12px] text-torg-gray">
                      {it.m && it.m !== "—" ? it.m : ""}{it.cap ? `${it.m && it.m !== "—" ? " · " : ""}${it.cap}` : ""}{it.obs ? ` — ${it.obs}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
