import Image from "next/image";

const SIZES = {
  sm: { w: 120, h: 68 },
  md: { w: 180, h: 101 },
  lg: { w: 260, h: 146 },
  xl: { w: 360, h: 203 },
};

export default function TorgLogo({ size = "md", className = "" }) {
  const { w, h } = SIZES[size] || SIZES.md;
  return (
    <Image
      src="/torg-logo.svg"
      alt="Torg Metal"
      width={w}
      height={h}
      priority
      className={className}
    />
  );
}
