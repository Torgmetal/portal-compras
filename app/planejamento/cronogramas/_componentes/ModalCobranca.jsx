"use client";
import { Loader2, Mail, Send, X } from "lucide-react";
import { DEPT_LABEL } from "../_lib/rotulos";

// Cobranca por e-mail do setor responsavel pelas tarefas em atraso.
export function ModalCobranca({
  addEmailExtra,
  atrasadas,
  ccPadrao,
  ccSelecionado,
  cobrando,
  dept,
  emailExtra,
  emailsSelecionados,
  emailsSugeridos,
  enviarCobranca,
  loadingEmails,
  setCcSelecionado,
  setEmailExtra,
  setShowCobrModal,
  toggleEmail,
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }} onClick={() => !cobrando && setShowCobrModal(false)}>
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="bg-red-50 border-b border-red-100 px-5 py-3 flex items-center gap-2">
          <Mail size={16} className="text-red-600" />
          <h3 className="text-sm font-bold text-red-800">Cobrar {DEPT_LABEL[dept] || dept}</h3>
          <span className="ml-auto text-xs text-red-500">{atrasadas.length} tarefa{atrasadas.length > 1 ? "s" : ""} atrasada{atrasadas.length > 1 ? "s" : ""}</span>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div>
            <p className="text-xs text-torg-gray font-medium mb-2">Destinatários:</p>
            {loadingEmails ? (
              <div className="flex items-center gap-2 text-xs text-torg-gray py-2">
                <Loader2 size={12} className="animate-spin" /> Buscando emails do setor...
              </div>
            ) : (
              <>
                {emailsSugeridos.length > 0 && (
                  <div className="space-y-1 mb-2">
                    <p className="text-[10px] text-torg-gray">Usuários do setor:</p>
                    {emailsSugeridos.map((u) => (
                      <label key={u.email} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailsSelecionados.includes(u.email)}
                          onChange={() => toggleEmail(u.email)}
                          className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                        />
                        <span className="text-xs text-torg-dark">{u.nome || u.email}</span>
                        <span className="text-[10px] text-torg-gray ml-auto">{u.email}</span>
                      </label>
                    ))}
                  </div>
                )}
                {emailsSugeridos.length === 0 && !loadingEmails && (
                  <p className="text-xs text-amber-600 py-1">Nenhum usuário encontrado para este setor. Adicione emails manualmente.</p>
                )}
              </>
            )}
            {emailsSelecionados.filter((e) => !emailsSugeridos.some((s) => s.email === e)).length > 0 && (
              <div className="space-y-1 mb-2">
                <p className="text-[10px] text-torg-gray">Adicionados manualmente:</p>
                {emailsSelecionados
                  .filter((e) => !emailsSugeridos.some((s) => s.email === e))
                  .map((email) => (
                    <div key={email} className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-50">
                      <span className="text-xs text-torg-dark">{email}</span>
                      <button onClick={() => toggleEmail(email)} className="ml-auto text-red-400 hover:text-red-600">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <input
                type="email"
                value={emailExtra}
                onChange={(e) => setEmailExtra(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmailExtra()}
                placeholder="Adicionar outro email..."
                className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded bg-white outline-none focus:border-torg-blue"
              />
              <button
                onClick={addEmailExtra}
                disabled={!emailExtra.includes("@")}
                className="px-2 py-1.5 text-xs text-torg-blue hover:bg-torg-blue-50 rounded disabled:opacity-30"
              >
                Adicionar
              </button>
            </div>
          </div>
          {ccPadrao.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-torg-gray font-medium mb-2">
                Em cópia <span className="font-normal">— a direção. Desmarque quem não precisa.</span>
              </p>
              <div className="space-y-1">
                {ccPadrao.map((c) => (
                  <label key={c.email} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ccSelecionado.includes(c.email)}
                      onChange={() => setCcSelecionado((prev) =>
                        prev.includes(c.email) ? prev.filter((x) => x !== c.email) : [...prev, c.email]
                      )}
                    />
                    <span className="text-xs text-torg-dark">{c.nome}</span>
                    <span className="text-[10px] text-torg-gray">{c.email}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <p className="text-[10px] text-amber-700">
              O email incluirá a lista de tarefas atrasadas e um link para o setor informar a nova data prevista de cada atividade.
            </p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/50">
          <button onClick={() => setShowCobrModal(false)} disabled={cobrando} className="px-3 py-1.5 text-xs text-torg-gray hover:text-torg-dark">
            Cancelar
          </button>
          <button
            onClick={enviarCobranca}
            disabled={cobrando || emailsSelecionados.length === 0}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {cobrando ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            Enviar para {emailsSelecionados.length} destinatário{emailsSelecionados.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
