// A FAIXA DO AMBIENTE DE DEMONSTRAÇÃO — fixa no topo, em toda tela, enquanto MODO_DEMO=1.
// Sem ela, quem está mostrando o portal ao cliente (ou testando) não sabe em qual banco está
// mexendo; e é exatamente esse "não sei onde estou" que faz uma OP fake ir parar na produção.
// Server component: lê a variável no servidor, sem JS no navegador.
export default function FaixaDemo() {
  if (process.env.MODO_DEMO !== "1") return null;
  return (
    <div className="sticky top-0 z-[100] bg-[#F4801F] text-white text-[12px] font-semibold tracking-wide text-center py-1 shadow" role="status">
      AMBIENTE DE DEMONSTRAÇÃO — banco local <span className="font-mono">torg_demo</span> · e-mail e Omie desligados · SharePoint grava em <span className="font-mono">DEMO/</span>
    </div>
  );
}
