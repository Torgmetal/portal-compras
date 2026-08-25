import ContatosClient from "./ContatosClient";

export const metadata = {
  title: "Contatos por setor — Workspace Torg",
  description: "Quem recebe os e-mails do portal em nome de cada setor.",
};

export default function ContatosPage() {
  return <ContatosClient />;
}
