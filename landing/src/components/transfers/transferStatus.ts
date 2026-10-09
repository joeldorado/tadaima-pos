import { CheckCircle2, Clock, X, type LucideIcon } from "lucide-react";
import type { Transfer } from "@tadaima/api";

export interface TransferStatusInfo {
  bg: string;
  color: string;
  icon: LucideIcon;
  label: string;
}

/** Colores y etiqueta por estado — los comparten la tarjeta y el popup de detalle. */
export function getStatusInfo(status: Transfer["status"]): TransferStatusInfo {
  switch (status) {
    case "pending":   return { bg: "rgba(255,170,0,0.15)",  color: "#FFAA00", icon: Clock,        label: "Pendiente"  };
    case "completed": return { bg: "rgba(0,204,102,0.15)",  color: "#00CC66", icon: CheckCircle2, label: "Completado" };
    case "cancelled": return { bg: "rgba(255,68,34,0.15)",  color: "#FF4422", icon: X,            label: "Cancelado"  };
  }
}
