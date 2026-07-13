import { redirect } from "next/navigation";

// URL antiga — agora o portal do funcionário é /colaborador.
export default function TrocarSenhaMeuRHPage() {
  redirect("/colaborador/trocar-senha");
}
