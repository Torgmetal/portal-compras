import Image from "next/image";
import Link from "next/link";
import TorgLogo from "@/components/TorgLogo";
import { ClipboardList, ShoppingCart, Truck, FolderKanban, ArrowRight, Factory, DollarSign, Handshake, Users, Cog, CalendarClock, TrendingUp, ShieldCheck } from "lucide-react";

const FOOTER_LOGO_W = 180;
const FOOTER_LOGO_H = Math.round((FOOTER_LOGO_W * 1080) / 1920);

const portais = [
  {
    href: "/comercial",
    label: "Comercial",
    desc: "Ordens de produção, revisões, aditivos e prazos.",
    Icon: FolderKanban,
  },
  {
    href: "/rm",
    label: "Requisições (RM)",
    desc: "Requisições de materiais e consumíveis.",
    Icon: ClipboardList,
  },
  {
    href: "/compras",
    label: "Compras",
    desc: "RMs, cotações, comparativos e pedidos.",
    Icon: ShoppingCart,
  },
  {
    href: "/producao",
    label: "Produção",
    desc: "Controle da fabricação e resultados por semana.",
    Icon: Factory,
  },
  {
    href: "/pcp",
    label: "PCP",
    desc: "Setores, máquinas e progresso por OP.",
    Icon: Cog,
  },
  {
    href: "/expedicao",
    label: "Expedição",
    desc: "Romaneios, cargas e peso expedido por OP.",
    Icon: Truck,
  },
  {
    href: "/planejamento",
    label: "Planejamento",
    desc: "Cronogramas e programação semanal.",
    Icon: CalendarClock,
  },
  {
    href: "/indicadores",
    label: "Indicadores",
    desc: "KPIs e visão gerencial consolidada.",
    Icon: TrendingUp,
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    desc: "Fluxo de caixa, receitas e validação.",
    Icon: DollarSign,
  },
  {
    href: "/rh",
    label: "Recursos Humanos",
    desc: "Pessoas, ponto, férias e benefícios.",
    Icon: Users,
  },
  {
    href: "/qualidade",
    label: "Qualidade",
    desc: "Documentos e data books por OP.",
    Icon: ShieldCheck,
  },
  {
    href: "/fornecedores",
    label: "Fornecedores",
    desc: "Envio de propostas e cotações.",
    Icon: Handshake,
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[80vh] min-h-[560px] overflow-hidden">
        <Image
          src="/obras/planta-industrial.jpg"
          alt="Planta industrial Torg Metal"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-torg-dark/85 via-torg-dark/60 to-torg-dark/30" />
        <div className="relative z-10 h-full flex flex-col">
          <header className="px-8 py-6 flex items-center justify-between">
            <div className="bg-white/95 backdrop-blur rounded-xl px-4 py-2 shadow-lg">
              <TorgLogo size="sm" />
            </div>
            <a
              href="https://www.torg.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/90 hover:text-white text-sm font-medium"
            >
              torg.com.br ↗
            </a>
          </header>

          <div className="flex-1 flex items-center px-8">
            <div className="max-w-3xl text-white">
              <p className="text-torg-orange font-semibold tracking-widest text-xs uppercase mb-4">
                Estruturas Metálicas Industriais
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
                Excelência em Soluções Construtivas.
              </h1>
              <p className="text-lg sm:text-xl text-white/85 max-w-2xl leading-relaxed">
                Cada projeto é moldado pela busca incessante por qualidade, inovação
                e tecnologia — do corte a laser à montagem em campo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Portais */}
      <section id="portais" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-torg-orange font-semibold tracking-widest text-xs uppercase mb-2">
            Workspace Torg
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-torg-dark tracking-tight">
            Escolha o portal que você usa
          </h2>
          <p className="text-torg-gray text-sm mt-3 max-w-xl mx-auto">
            O Workspace reúne os portais internos da Torg Metal — cada perfil acessa o seu.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {portais.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group relative flex flex-col items-start bg-white rounded-[13px] border border-slate-200 p-5 hover:border-torg-blue hover:shadow-[0_4px_16px_rgba(0,110,171,0.07)] focus-visible:border-torg-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torg-blue transition-[border-color,box-shadow] motion-reduce:transition-none"
            >
              <span aria-hidden="true" className="absolute top-6 right-5 h-[3px] w-4 rounded-full bg-torg-orange opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity motion-reduce:transition-none" />
              <div className="w-12 h-12 rounded-xl bg-torg-blue-50/60 text-torg-blue flex items-center justify-center mb-4">
                <Icon size={25} strokeWidth={1.65} aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-torg-dark mb-2">{label}</h3>
              <p className="text-sm text-torg-gray leading-relaxed mb-4 flex-1">{desc}</p>
              <span className="text-sm font-semibold text-torg-blue inline-flex items-center gap-1.5">
                Entrar <ArrowRight size={14} strokeWidth={1.7} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Sobre */}
      <section className="bg-torg-blue-50/50 border-y border-torg-blue-100">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-torg-orange font-semibold tracking-widest text-xs uppercase mb-3">
              Sobre a Torg Metal
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-torg-dark tracking-tight mb-5">
              Referência em estruturas metálicas industriais.
            </h2>
            <p className="text-torg-gray leading-relaxed mb-4">
              Equipe experiente e capacitada, dedicada a atender as peculiaridades
              de cada demanda — entregando estruturas eficientes que garantem o
              sucesso da obra.
            </p>
            <ul className="space-y-2 text-torg-dark text-sm">
              <li className="flex gap-2"><span className="text-torg-orange font-bold">›</span> Corte a laser e furação CNC</li>
              <li className="flex gap-2"><span className="text-torg-orange font-bold">›</span> Fabricação e tratamento de superfície</li>
              <li className="flex gap-2"><span className="text-torg-orange font-bold">›</span> Montagem em campo</li>
              <li className="flex gap-2"><span className="text-torg-orange font-bold">›</span> Galpões, torres, pipe racks e estruturas residenciais</li>
            </ul>
          </div>
          <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl">
            <Image
              src="/obras/ponte-trelica.jpg"
              alt="Treliça metálica"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-torg-dark text-white/70">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap justify-between items-center gap-4 text-sm">
          <Image
            src="/torg-logo-white.png"
            alt="Torg Metal"
            width={FOOTER_LOGO_W}
            height={FOOTER_LOGO_H}
            className="opacity-90"
          />
          <p>© {new Date().getFullYear()} Torg Metal — Workspace Torg</p>
        </div>
      </footer>
    </div>
  );
}
