import { Factory, CircleAlert, ArrowRight } from "lucide-react";

// MES PRÓPRIO — área de construção, fora do portal.
//
// ⚠ Rota fechada no middleware.js (só ADMIN) e ausente de TODO menu, de propósito: enquanto o
// Syneco continua sendo o apontamento de verdade, quem do chão de fábrica caísse aqui apontaria
// no lugar errado. O plano e o levantamento vivem em docs/mes-proprio.md.
export const metadata = {
  title: "MES Torg (laboratório) — em construção",
  robots: { index: false, follow: false },
};

const FASES = [
  {
    n: 1,
    titulo: "Levantamento e contrato",
    estado: "feito",
    itens: [
      "Mapear o Syneco: terminal (9123), SKA Reports (81/1000), banco TORG_SYNECO",
      "Achar o contrato atual: MesApontamento / MesOrdem e os 7 consumidores do portal",
      "Decidir o princípio: event-sourced, projetando para o contrato que já existe",
    ],
  },
  {
    n: 2,
    titulo: "Cadastro e modelo",
    estado: "proximo",
    itens: [
      "MesRecurso (53 máquinas/postos), MesTurno, MesOperador, MesMotivoParada",
      "MesEvento — o fato imutável (PRODUCAO/SETUP/PARADA/RETRABALHO/MANUTENCAO)",
      "Projeção MesEvento → MesApontamento, para rodar em paralelo com o Syneco",
    ],
  },
  {
    n: 3,
    titulo: "Terminal do operador",
    estado: "planejado",
    itens: [
      "PWA de totem: crachá, bipar marca, iniciar produção, apontar quantidade",
      "Offline-first (fila local) — a fábrica não pode parar por queda de internet",
      "Paridade com o Syneco: trocar operador/ordem, setup, parada com motivo",
    ],
  },
  {
    n: 4,
    titulo: "Monitor e OEE",
    estado: "planejado",
    itens: [
      "Monitor de máquinas em tempo real (SSE), no padrão dos cards de hoje",
      "OEE materializado por recurso/turno — nunca recalculado por request (Neon)",
      "IOT dos lasers: sinal do CNC vira evento automático",
    ],
  },
];

const COR = {
  feito: "bg-green-100 text-green-700 border-green-200",
  proximo: "bg-torg-orange/15 text-torg-orange border-torg-orange/30",
  planejado: "bg-gray-100 text-torg-gray border-gray-200",
};
const ROTULO = { feito: "Concluído", proximo: "Próximo", planejado: "Planejado" };

export default function MesLabPage() {
  return (
    <div className="min-h-screen bg-torg-blue-50/30">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-torg-blue text-white">
            <Factory size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight text-torg-dark">
              MES Torg <span className="text-torg-gray font-normal">· laboratório</span>
            </h1>
            <p className="mt-1 text-sm text-torg-gray">
              Nosso MES próprio, para substituir o Syneco. Em construção — nada aqui é o
              apontamento oficial ainda.
            </p>
          </div>
        </header>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-amber-900">
            <strong>O apontamento de verdade continua no Syneco.</strong> Esta área existe para
            construirmos o substituto com calma e rodarmos os dois em paralelo antes de virar a
            chave. Rota fechada ao ADMIN e fora de todos os menus.
          </p>
        </div>

        <section className="mt-8 space-y-4">
          {FASES.map((f) => (
            <div
              key={f.n}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-torg-blue-50 text-sm font-bold text-torg-blue">
                  {f.n}
                </span>
                <h2 className="flex-1 text-lg font-semibold text-torg-dark">{f.titulo}</h2>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${COR[f.estado]}`}
                >
                  {ROTULO[f.estado]}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 pl-10">
                {f.itens.map((i) => (
                  <li key={i} className="flex gap-2 text-sm text-torg-dark/80">
                    <ArrowRight size={14} className="mt-1 shrink-0 text-torg-gray" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <p className="mt-8 text-center text-xs text-torg-gray">
          Levantamento completo, arquitetura e riscos em <code>docs/mes-proprio.md</code>
        </p>
      </div>
    </div>
  );
}
