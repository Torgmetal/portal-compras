"use client";
import CronogramasClient from "../CronogramasClient";

export default function CronogramaDetalheClient({ cronogramaId }) {
  return <CronogramasClient soloId={cronogramaId} />;
}
