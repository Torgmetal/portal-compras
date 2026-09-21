"use client";
import { useState } from "react";
import { Loader2, MailWarning } from "lucide-react";
import { CATEGORIAS_FORNECEDOR_BUILTIN, chipCategoriaFornecedor, labelCategoriaFornecedor } from "@/lib/fornecedor-categorias";
import { emailPrincipal } from "@/lib/fornecedores-envio";

// Uma linha da Vendor List no picker de envio de cotação — usada pelo modal da
// RM (FornecedoresPicker) e pelo envio consolidado do painel (RMsTabelaSeletor),
// para as duas telas tratarem o cadastro sem e-mail do MESMO jeito.
//
// ⚠⚠ 435 CADASTROS ATIVOS ESTÃO SEM E-MAIL (importação do Omie, medido em
// 21/09/2026) — quase metade da lista. Antes, a linha era igual às outras, o
// checkbox aceitava, e o clique em "Criar cotações" morria em silêncio. Agora
// a linha diz "sem e-mail", o checkbox só liga depois de existir um, e o
// e-mail pode ser informado AQUI, sem sair do modal: ele vai para o cadastro
// (`PATCH /api/fornecedores/[id]`), não só para este envio — senão a próxima
// cotação para o mesmo fornecedor bateria na mesma parede.
export function LinhaFornecedorPicker({
  fornecedor: f,
  checked,
  onToggle,
  onEmailSalvo,
  categoriasFornecedor = CATEGORIAS_FORNECEDOR_BUILTIN,
  mostrarContato = false,
}) {
  const email = emailPrincipal(f.email);
  const [editando, setEditando] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async () => {
    const limpo = emailPrincipal(novoEmail);
    if (!limpo) return setErro("E-mail inválido.");
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/fornecedores/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: limpo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      onEmailSalvo?.(f.id, data.fornecedor?.email || limpo);
      setEditando(false);
      setNovoEmail("");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className={`px-3 py-2 text-xs hover:bg-gray-50 ${checked ? "bg-torg-blue-50/40" : ""}`}>
      <label className={`flex items-start gap-2 ${email ? "cursor-pointer" : "cursor-not-allowed"}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!email}
          onChange={onToggle}
          title={email ? undefined : "Sem e-mail no cadastro — informe o e-mail ao lado para poder selecionar."}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue disabled:opacity-40"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className={`font-medium truncate ${email ? "text-torg-dark" : "text-torg-gray"}`}>{f.razaoSocial}</p>
            {email ? (
              <span className="text-[10px] text-torg-gray">{email}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
                <MailWarning size={10} /> sem e-mail
              </span>
            )}
          </div>
          {(f.categorias || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {f.categorias.map((c) => (
                <span
                  key={c}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${chipCategoriaFornecedor(c, categoriasFornecedor)}`}
                >
                  {labelCategoriaFornecedor(c, categoriasFornecedor)}
                </span>
              ))}
            </div>
          )}
          {mostrarContato && f.contato && (
            <p className="text-[10px] text-torg-gray mt-0.5 italic">contato: {f.contato}</p>
          )}
        </div>
      </label>
      {!email && (
        <div className="mt-1.5 ml-6">
          {editando ? (
            <div className="flex items-start gap-1.5 flex-wrap">
              <input
                type="email"
                autoFocus
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }}
                placeholder="email@fornecedor.com.br"
                className="flex-1 min-w-[180px] text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-torg-blue"
              />
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="text-[11px] px-2 py-1 rounded bg-torg-blue text-white font-medium hover:bg-torg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {salvando && <Loader2 size={10} className="animate-spin" />} Salvar no cadastro
              </button>
              <button
                type="button"
                onClick={() => { setEditando(false); setErro(""); }}
                className="text-[11px] px-2 py-1 rounded border border-gray-300 text-torg-gray hover:bg-gray-100"
              >
                Cancelar
              </button>
              {erro && <p className="w-full text-[10px] text-red-700">{erro}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-[11px] text-torg-blue hover:text-torg-dark font-medium underline-offset-2 hover:underline"
            >
              informar e-mail
            </button>
          )}
        </div>
      )}
    </div>
  );
}
