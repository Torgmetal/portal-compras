"use client";
import { STATUS_COLORS } from "@/lib/utils";

export default function Badge({ status }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
        STATUS_COLORS[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}
