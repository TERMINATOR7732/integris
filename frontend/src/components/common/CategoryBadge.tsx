import {
  FileQuestion,
  Copy,
  CheckSquare,
  BarChart3,
  GitCompare,
  AlertTriangle,
  FolderTree,
} from 'lucide-react';
import type { FindingCategory } from '../../types/integris';

interface CategoryBadgeProps {
  category: FindingCategory;
  size?: 'sm' | 'md';
}

export function CategoryBadge({ category, size = 'md' }: CategoryBadgeProps) {
  const cat = category.toLowerCase() as FindingCategory;

  const config = {
    completeness: {
      label: 'Completeness',
      icon: FileQuestion,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.08)',
      border: 'rgba(56, 189, 248, 0.25)',
    },
    uniqueness: {
      label: 'Uniqueness',
      icon: Copy,
      color: '#a78bfa',
      bg: 'rgba(167, 139, 250, 0.08)',
      border: 'rgba(167, 139, 250, 0.25)',
    },
    validity: {
      label: 'Validity',
      icon: CheckSquare,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.08)',
      border: 'rgba(245, 158, 11, 0.25)',
    },
    distribution: {
      label: 'Distribution',
      icon: BarChart3,
      color: '#34d399',
      bg: 'rgba(52, 211, 153, 0.08)',
      border: 'rgba(52, 211, 153, 0.25)',
    },
    consistency: {
      label: 'Consistency',
      icon: GitCompare,
      color: '#fb7185',
      bg: 'rgba(251, 113, 133, 0.08)',
      border: 'rgba(251, 113, 133, 0.25)',
    },
    data_leakage: {
      label: 'Leakage Indicator',
      icon: AlertTriangle,
      color: '#fb923c',
      bg: 'rgba(251, 146, 60, 0.08)',
      border: 'rgba(251, 146, 60, 0.25)',
    },
    schema: {
      label: 'Schema',
      icon: FolderTree,
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.08)',
      border: 'rgba(148, 163, 184, 0.25)',
    },
  }[cat] || {
    label: category,
    icon: CheckSquare,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.08)',
    border: 'rgba(148, 163, 184, 0.25)',
  };

  const Icon = config.icon;
  const isSm = size === 'sm';

  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: isSm ? '1px 6px' : '2px 8px',
        borderRadius: '5px',
        fontSize: isSm ? '0.7rem' : '0.75rem',
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={isSm ? 11 : 13} />
      <span>{config.label}</span>
    </span>
  );
}
