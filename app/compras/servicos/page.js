import { redirect } from "next/navigation";

// Rota antiga "Aluguel & Montagem" — agora são duas páginas separadas.
// Mantida só como redirect para links/favoritos antigos.
export default function ServicosRedirect({ searchParams }) {
  const destino = searchParams?.tipo === "MONTAGEM" ? "/compras/montagem" : "/compras/aluguel";
  // ⚠ Leva `op` junto: link antigo que já filtrava uma obra continua filtrando a mesma.
  const q = new URLSearchParams();
  if (searchParams?.arquivadas === "1") q.set("arquivadas", "1");
  if (searchParams?.op) q.set("op", String(searchParams.op));
  const s = q.toString();
  redirect(s ? `${destino}?${s}` : destino);
}
