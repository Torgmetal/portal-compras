"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Network,
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  Crown,
  User,
  AlertCircle,
  RefreshCw,
  Loader2,
  Briefcase,
} from "lucide-react";

const STATUS_CORES = {
  ATIVO: "bg-green-400",
  AFASTADO: "bg-yellow-400",
  FERIAS: "bg-blue-400",
  DEMITIDO: "bg-red-400",
};

const STATUS_LABEL = {
  ATIVO: "Ativo",
  AFASTADO: "Afastado",
  FERIAS: "Férias",
  DEMITIDO: "Demitido",
};

function AvatarInicial({ nome, tamanho = "md", foto }) {
  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-lg",
  };

  if (foto) {
    return (
      <img
        src={foto}
        alt={nome}
        className={`${sizes[tamanho]} rounded-full object-cover border-2 border-white shadow`}
      />
    );
  }

  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={`${sizes[tamanho]} rounded-full bg-gradient-to-br from-torg-blue to-torg-dark flex items-center justify-center text-white font-bold shadow`}
    >
      {iniciais}
    </div>
  );
}

function CardEmpresa({ empresa, totalSetores, totalFuncionarios }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-gradient-to-br from-torg-dark to-torg-blue text-white rounded-2xl px-8 py-5 shadow-lg border border-torg-blue/20 min-w-[260px] text-center">
        <Building2 size={28} className="mx-auto mb-2 opacity-80" />
        <h3 className="text-lg font-bold tracking-tight">{empresa}</h3>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-blue-100">
          <span className="flex items-center gap-1">
            <Briefcase size={12} />
            {totalSetores} {totalSetores === 1 ? "setor" : "setores"}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {totalFuncionarios} {totalFuncionarios === 1 ? "colaborador" : "colaboradores"}
          </span>
        </div>
      </div>
      {/* Linha vertical descendo */}
      {totalSetores > 0 && <div className="w-px h-8 bg-gray-300" />}
    </div>
  );
}

function CardSetor({ setor, expandido, onToggle, destaque = false }) {
  const cor = setor.cor || "#006EAB";
  const totalMembros = setor.funcionarios?.length || 0;
  const gestor = setor.gestor;

  return (
    <div className="flex flex-col items-center">
      {/* Linha vertical chegando */}
      <div className="w-px h-4 bg-gray-300" />

      <button
        onClick={onToggle}
        className={`group rounded-xl shadow-sm border hover:shadow-md transition-all overflow-hidden text-left ${
          destaque
            ? "bg-gradient-to-b from-torg-dark/[0.03] to-white border-torg-blue/20 min-w-[260px] max-w-[320px]"
            : "bg-white border-gray-100 min-w-[220px] max-w-[280px]"
        }`}
      >
        {/* Barra de cor do setor */}
        <div className="h-1.5 w-full" style={{ backgroundColor: cor }} />

        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cor }}
              />
              <h4 className="font-semibold text-torg-dark text-sm truncate">
                {setor.nome}
              </h4>
              {setor.sigla && (
                <span className="text-[10px] font-medium text-torg-gray bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">
                  {setor.sigla}
                </span>
              )}
            </div>
            <span className="text-gray-400 group-hover:text-torg-blue transition-colors flex-shrink-0">
              {expandido ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </div>

          {/* Gestor */}
          {gestor && (
            <div className="flex items-center gap-2 mt-3 p-2 bg-amber-50/60 rounded-lg border border-amber-100/60">
              <AvatarInicial nome={gestor.nome} tamanho="sm" foto={gestor.foto} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <Crown size={10} className="text-amber-500 flex-shrink-0" />
                  <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">
                    Gestor
                  </span>
                </div>
                <p className="text-xs font-medium text-torg-dark truncate">
                  {gestor.nome}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 mt-3 text-xs text-torg-gray">
            <Users size={12} />
            <span>
              {totalMembros} {totalMembros === 1 ? "colaborador" : "colaboradores"}
            </span>
          </div>
        </div>
      </button>

      {/* Membros expandidos */}
      {expandido && totalMembros > 0 && (
        <>
          <div className="w-px h-3 bg-gray-200" />
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 min-w-[220px] max-w-[280px]">
            <div className="space-y-2">
              {setor.funcionarios.map((func) => (
                <div
                  key={func.id}
                  className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="relative flex-shrink-0">
                    <AvatarInicial nome={func.nome} tamanho="sm" foto={func.foto} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${STATUS_CORES[func.status] || "bg-gray-400"}`}
                      title={STATUS_LABEL[func.status] || func.status}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-torg-dark truncate">
                      {func.nome}
                    </p>
                    {func.cargo && (
                      <p className="text-[10px] text-torg-gray truncate">
                        {func.cargo.nome}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {expandido && totalMembros === 0 && (
        <>
          <div className="w-px h-3 bg-gray-200" />
          <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 p-3 min-w-[220px] text-center">
            <p className="text-xs text-torg-gray">Nenhum colaborador vinculado</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function OrganoClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [expandidos, setExpandidos] = useState({});

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/rh/organograma");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setDados(json.data);
      // Expandir todos por padrão se tiver poucos setores
      if (json.data.setores.length <= 6) {
        const all = {};
        json.data.setores.forEach((s) => (all[s.id] = true));
        setExpandidos(all);
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const toggleSetor = (id) => {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandirTodos = () => {
    if (!dados) return;
    const all = {};
    dados.setores.forEach((s) => (all[s.id] = true));
    setExpandidos(all);
  };

  const recolherTodos = () => setExpandidos({});

  const todosExpandidos =
    dados && dados.setores.length > 0 && dados.setores.every((s) => expandidos[s.id]);

  // Loading
  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Organograma
          </h2>
          <p className="text-sm text-torg-gray mt-1">Estrutura hierárquica da empresa</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
          <Loader2 size={32} className="mx-auto text-torg-blue animate-spin mb-3" />
          <p className="text-sm text-torg-gray">Carregando organograma...</p>
        </div>
      </div>
    );
  }

  // Erro
  if (erro) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Organograma
          </h2>
          <p className="text-sm text-torg-gray mt-1">Estrutura hierárquica da empresa</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
          <p className="text-sm text-red-600 mb-4">{erro}</p>
          <button
            onClick={carregar}
            className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark transition-colors"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Vazio
  if (!dados || dados.totalSetores === 0) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Organograma
          </h2>
          <p className="text-sm text-torg-gray mt-1">Estrutura hierárquica da empresa</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Network size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">Nenhum setor cadastrado</p>
          <p className="text-xs text-torg-gray mt-2">
            Cadastre setores e funcionários na aba correspondente para visualizar o organograma.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Organograma
          </h2>
          <p className="text-sm text-torg-gray mt-1">Estrutura hierárquica da empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={todosExpandidos ? recolherTodos : expandirTodos}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-torg-gray bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {todosExpandidos ? (
              <>
                <ChevronRight size={13} />
                Recolher todos
              </>
            ) : (
              <>
                <ChevronDown size={13} />
                Expandir todos
              </>
            )}
          </button>
          <button
            onClick={carregar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-torg-gray bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Legenda de status */}
      <div className="flex items-center gap-4 text-xs text-torg-gray">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_CORES[key]}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Organograma visual */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 overflow-x-auto">
        {(() => {
          const diretoria = dados.setores.filter((s) =>
            s.nome.toLowerCase().includes("diretoria")
          );
          const demais = dados.setores.filter(
            (s) => !s.nome.toLowerCase().includes("diretoria")
          );

          return (
            <div className="flex flex-col items-center min-w-fit">
              {/* Card da empresa no topo */}
              <CardEmpresa
                empresa={dados.empresa}
                totalSetores={dados.totalSetores}
                totalFuncionarios={dados.totalFuncionarios}
              />

              {/* Nível da Diretoria (acima dos demais) */}
              {diretoria.length > 0 && (
                <>
                  <div className="flex gap-6 justify-center">
                    {diretoria.map((setor) => (
                      <CardSetor
                        key={setor.id}
                        setor={setor}
                        expandido={!!expandidos[setor.id]}
                        onToggle={() => toggleSetor(setor.id)}
                        destaque
                      />
                    ))}
                  </div>

                  {/* Conector da diretoria para os setores abaixo */}
                  {demais.length > 0 && (
                    <div className="w-px h-6 bg-gray-300" />
                  )}
                </>
              )}

              {/* Linha horizontal conectando setores do nível operacional */}
              {demais.length > 1 && (
                <div className="flex items-start">
                  <div
                    className="h-px bg-gray-300"
                    style={{
                      width: `${(demais.length - 1) * 300}px`,
                    }}
                  />
                </div>
              )}

              {/* Grid dos demais setores */}
              {demais.length > 0 && (
                <div className="flex gap-6 flex-wrap justify-center">
                  {demais.map((setor) => (
                    <CardSetor
                      key={setor.id}
                      setor={setor}
                      expandido={!!expandidos[setor.id]}
                      onToggle={() => toggleSetor(setor.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
