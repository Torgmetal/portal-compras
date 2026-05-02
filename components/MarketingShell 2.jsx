import Image from "next/image";
import Link from "next/link";
import TorgLogo from "@/components/TorgLogo";

export default function MarketingShell({ image, kicker, title, lead, children }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* Imagem da obra */}
      <div className="relative lg:w-1/2 h-64 lg:h-auto lg:min-h-screen overflow-hidden">
        <Image
          src={image}
          alt="Obra Torg Metal"
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-torg-dark/85 via-torg-dark/40 to-torg-dark/10" />
        <div className="relative z-10 h-full flex flex-col justify-between p-8">
          <Link href="/" className="bg-white/95 backdrop-blur rounded-xl px-4 py-2 shadow-lg w-fit">
            <TorgLogo size="sm" />
          </Link>
          <div className="text-white max-w-md hidden lg:block">
            <p className="text-torg-orange font-semibold tracking-widest text-xs uppercase mb-3">
              {kicker}
            </p>
            <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight mb-3">
              {title}
            </h1>
            <p className="text-white/85 leading-relaxed">{lead}</p>
          </div>
        </div>
      </div>

      {/* Conteúdo (formulário/instruções) */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6">
            <p className="text-torg-orange font-semibold tracking-widest text-xs uppercase mb-2">
              {kicker}
            </p>
            <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight mb-2">
              {title}
            </h1>
            <p className="text-torg-gray text-sm leading-relaxed">{lead}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
