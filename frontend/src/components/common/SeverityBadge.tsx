import { AlertOctagon, AlertTriangle, AlertCircle, Info, HelpCircle } from 'lucide-react';
import type { Severity } from '../../types/integris';

interface SeverityBadgeProps {
  severity: Severity;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function SeverityBadge({ severity, showIcon = true, size = 'md' }: SeverityBadgeProps) {
  const sev = severity.toLowerCase() as Severity;

  const config = {
    critical: {
      label: 'CRITICAL',
      color: '#f43f5e',
      bg: 'rgba(244, 63, 94, 0.12)',
      border: 'rgba(244, 63, 94, 0.35)',
      Icon: AlertOctagon,
    },
    high: {
      label: 'HIGH',
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.35)',
      Icon: AlertTriangle,
    },
    medium: {
      label: 'MEDIUM',
      color: '#eab308',
      bg: 'rgba(234, 179, 8, 0.12)',
      border: 'rgba(234, 179, 8, 0.35)',
      Icon: AlertCircle,
    },
    low: {
      label: 'LOW',
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.12)',
      border: 'rgba(56, 189, 248, 0.35)',
      Icon: Info,
    },
    info: {
      label: 'INFO',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.35)',
      Icon: HelpCircle,
    },
  }[sev] || {
    label: severity.toUpperCase(),
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.35)',
    Icon: Info,
  };

  const IconComponent = config.Icon;
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? '4px' : '6px',
        padding: isSm ? '1px 6px' : isLg ? '4px 12px' : '2px 8px',
        borderRadius: '6px',
        fontSize: isSm ? '0.7rem' : isLg ? '0.85rem' : '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: config.color,
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {showIcon && <IconComponent size={isSm ? 12 : isLg ? 16 : 14} strokeWidth={2.2} />}
      <span>{config.label}</span>
    </span>
  );
}
