import { redirect } from "next/navigation";

export const metadata = {
  title: "Workspace Torg — PCP Peças / LPC",
};

export default function PCPPecasPage() {
  redirect("/pcp/producao");
}
