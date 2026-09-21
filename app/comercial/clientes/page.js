import ClientesClient from "./ClientesClient";

export const metadata = { title: "Clientes — termos e referências" };
export const dynamic = "force-dynamic";

export default function ClientesPage() {
  return <ClientesClient />;
}
