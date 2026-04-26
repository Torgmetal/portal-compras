// Placeholder do logo TORG METAL nas cores oficiais (azul claro + escuro).
// Quando o arquivo PNG/SVG oficial for adicionado em /public/torg-logo.png ou
// /public/torg-logo.svg, este componente pode ser substituído por <Image>.

export default function TorgLogo({ size = "md", showText = true, className = "" }) {
  const dimensions = {
    sm: { mark: 24, text: "text-base" },
    md: { mark: 32, text: "text-lg" },
    lg: { mark: 48, text: "text-2xl" },
    xl: { mark: 64, text: "text-3xl" },
  }[size] || { mark: 32, text: "text-lg" };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={dimensions.mark}
        height={dimensions.mark}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* M shape — escuro */}
        <path d="M28 8 L36 8 L36 50 L28 50 Z" fill="#002945" />
        <path d="M40 8 L48 8 L48 50 L40 50 Z" fill="#002945" />
        <path d="M28 8 L48 18 L48 28 L28 18 Z" fill="#002945" />
        {/* T abstract — azul claro */}
        <path d="M14 50 L24 50 L34 12 L20 12 Z" fill="#006EAB" />
      </svg>
      {showText && (
        <span className={`${dimensions.text} font-extrabold tracking-tight leading-none`}>
          <span className="text-torg-dark">TORG</span>
          <span className="text-torg-blue font-light">METAL</span>
        </span>
      )}
    </div>
  );
}
