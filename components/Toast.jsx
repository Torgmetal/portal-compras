"use client";
import { useStore } from "@/lib/store";

export default function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div
      className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium z-50 transition-all ${
        toast.type === "error" ? "bg-red-500" : "bg-green-500"
      }`}
    >
      {toast.msg}
    </div>
  );
}
