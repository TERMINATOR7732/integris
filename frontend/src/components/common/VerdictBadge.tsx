import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { ExecutiveVerdict } from '../../types/integris';

interface VerdictBadgeProps {
  verdict: ExecutiveVerdict;
  grade?: string;
  size?: 'md' | 'lg';
}

export function VerdictBadge({ verdict, grade, size = 'md' }: VerdictBadgeProps) {
  const v = verdict.toLowerCase() as ExecutiveVerdict;

  const config = {
    reliable: {
      label: 'RELIABLE',
      color: '#34d399',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.35)',
      Icon: ShieldCheck,
      description: 'Passed core structural & statistical checks',
    },
    caution: {
      label: 'CAUTION',
      color: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.35)',
      Icon: AlertTriangle,
      description: 'Moderate data-quality risks detected',
    },
    compromised: {
      label: 'COMPROMISED',
      color: '#fb7185',
      bg: 'rgba(244, 63, 94, 0.12)',
      border: 'rgba(244, 63, 94, 0.35)',
      Icon: ShieldAlert,
      description: 'Severe integrity flaws; unsuitable for production',
    },
  }[v] || {
    label: verdict.toUpperCase(),
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.35)',
    Icon: AlertTriangle,
    description: 'Investigation evaluation',
  };

  const Icon = config.Icon;
  const isLg = size === 'lg';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isLg ? '10px' : '6px',
        padding: isLg ? '6px 16px' : '3px 10px',
        borderRadius: '8px',
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      <Icon size={isLg ? 22 : 16} color={config.color} strokeWidth={2.4} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span
          className="mono"
          style={{
            fontSize: isLg ? '1.1rem' : '0.85rem',
            fontWeight: 800,
            letterSpacing: '0.05em',
            color: config.color,
          }}
        >
          {config.label}
        </span>
        {grade && (
          <span
            className="mono"
            style={{
              fontSize: isLg ? '0.85rem' : '0.75rem',
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            ({grade})
          </span>
        )}
      </div>
    </div>
  );
}
