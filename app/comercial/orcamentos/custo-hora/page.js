import { redirect } from "next/navigation";

// Custo-hora foi movido para o Portal da Diretoria (faz mais sentido lá).
export default function CustoHoraPage() {
  redirect("/diretoria");
}
