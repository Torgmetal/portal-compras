"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const StoreContext = createContext(null);

const STORAGE_KEY = "portal-compras-data";

const defaultData = {
  rms: [],
  fornecedores: [
    {
      id: "demo-1",
      nome: "Fornecedor Exemplo",
      cnpj: "00.000.000/0001-00",
      email: "exemplo@forn.com",
      telefone: "",
      categorias: ["Material", "Consumível"],
    },
  ],
  catalogo: [],
};

function loadData() {
  if (typeof window === "undefined") return defaultData;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw);
    return { ...defaultData, ...parsed };
  } catch {
    return defaultData;
  }
}

function saveData(data) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function StoreProvider({ children }) {
  const [rms, setRmsState] = useState([]);
  const [fornecedores, setFornecedoresState] = useState([]);
  const [catalogo, setCatalogoState] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const data = loadData();
    setRmsState(data.rms);
    setFornecedoresState(data.fornecedores);
    setCatalogoState(data.catalogo || []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveData({ rms, fornecedores, catalogo });
  }, [rms, fornecedores, catalogo, loaded]);

  const setRms = useCallback((updater) => {
    setRmsState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const setFornecedores = useCallback((updater) => {
    setFornecedoresState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const setCatalogo = useCallback((updater) => {
    setCatalogoState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <StoreContext.Provider value={{ rms, setRms, fornecedores, setFornecedores, catalogo, setCatalogo, loaded, toast, showToast }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
