interface AvailabilityBadgeProps {
  value: "disponible" | "escaso" | "agotado" | "descontinuado" | string;
  locale?: string;
}

function isEnglishLocale(locale?: string): boolean {
  return (locale ?? "").toLowerCase().startsWith("en");
}

export function AvailabilityBadge({ value, locale }: AvailabilityBadgeProps) {
  const map: Record<string, { label: string; classes: string; dot: string }> = isEnglishLocale(locale)
    ? {
        disponible: {
          label: "Available",
          classes: "bg-status-ok/10 text-status-ok",
          dot: "bg-status-ok",
        },
        escaso: {
          label: "Scarce",
          classes: "bg-status-warn/10 text-status-warn",
          dot: "bg-status-warn",
        },
        agotado: {
          label: "Out of stock",
          classes: "bg-status-risk/10 text-status-risk",
          dot: "bg-status-risk",
        },
        descontinuado: {
          label: "Discontinued",
          classes: "bg-ink/10 text-ink",
          dot: "bg-ink",
        },
      }
    : {
    disponible: {
      label: "Disponible",
      classes: "bg-status-ok/10 text-status-ok",
      dot: "bg-status-ok",
    },
    escaso: {
      label: "Escaso",
      classes: "bg-status-warn/10 text-status-warn",
      dot: "bg-status-warn",
    },
    agotado: {
      label: "Agotado",
      classes: "bg-status-risk/10 text-status-risk",
      dot: "bg-status-risk",
    },
    descontinuado: {
      label: "Descontinuado",
      classes: "bg-ink/10 text-ink",
      dot: "bg-ink",
    },
      };
  const meta = map[value] ?? {
    label: value,
    classes: "bg-ink/5 text-ink",
    dot: "bg-ink-soft",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.classes}`}
    >
      <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

interface CriticalityBadgeProps {
  critical: boolean;
}

export function CriticalityBadge({ critical }: CriticalityBadgeProps) {
  if (critical) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-canvas">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        Crítico
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ink-soft" />
      Estándar
    </span>
  );
}

interface SupplyTypeBadgeProps {
  type: string;
  locale?: string;
}

export function SupplyTypeBadge({ type, locale }: SupplyTypeBadgeProps) {
  const labels: Record<string, string> = isEnglishLocale(locale)
    ? {
        material: "Material",
        equipo: "Equipment",
        mano_obra: "Labor",
        subcontrato: "Subcontract",
      }
    : {
        material: "Material",
        equipo: "Equipo",
        mano_obra: "Mano de obra",
        subcontrato: "Subcontrato",
      };
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-canvas px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
      {labels[type] ?? type}
    </span>
  );
}

interface POStatusBadgeProps {
  status: string;
}

export function POStatusBadge({ status }: POStatusBadgeProps) {
  const map: Record<string, { label: string; classes: string }> = {
    borrador: { label: "Borrador", classes: "bg-ink/5 text-ink-muted" },
    enviada: { label: "Enviada", classes: "bg-status-warn/10 text-status-warn" },
    aprobada: { label: "Aprobada", classes: "bg-status-ok/10 text-status-ok" },
    recibida: { label: "Recibida", classes: "bg-status-ok/10 text-status-ok" },
    cancelada: { label: "Cancelada", classes: "bg-status-risk/10 text-status-risk" },
  };
  const meta = map[status] ?? { label: status, classes: "bg-ink/5 text-ink" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.classes}`}>
      {meta.label}
    </span>
  );
}
