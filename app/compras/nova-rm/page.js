import { redirect } from "next/navigation";

// Esta rota foi consolidada no Portal de RMs.
// /compras/nova-rm → /rm/nova (versão correta que persiste no banco).
export default function ComprasNovaRMRedirect() {
  redirect("/rm/nova");
}
