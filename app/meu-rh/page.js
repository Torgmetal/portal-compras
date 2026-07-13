import { redirect } from "next/navigation";

// Não usamos mais /meu-rh como URL do funcionário — o portal é /colaborador.
export default function MeuRHPage() {
  redirect("/colaborador");
}
