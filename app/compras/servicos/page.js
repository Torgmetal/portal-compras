import { redirect } from "next/navigation";

// Rota antiga "Aluguel & Montagem" — agora são duas páginas separadas.
// Mantida só como redirect para links/favoritos antigos.
export default function ServicosRedirect({ searchParams }) {
  const destino = searchParams?.tipo === "MONTAGEM" ? "/compras/montagem" : "/compras/aluguel";
  redirect(searchParams?.arquivadas === "1" ? `${destino}?arquivadas=1` : destino);
}
