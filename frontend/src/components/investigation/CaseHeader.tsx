import { FileText, Clock, Cpu, ArrowLeft, Target, HardDrive } from 'lucide-react';
import type { InvestigationMetadata } from '../../types/integris';

interface CaseHeaderProps {
  metadata: InvestigationMetadata;
  targetColumn?: string;
  onNewInvestigation: () => void;
  onGenerateReport?: () => void;
}

export function CaseHeader({ metadata, targetColumn, onNewInvestigation, onGenerateReport }: CaseHeaderProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#0c121d',
        borderRadius: '12px',
        border: '1px solid #1e293b',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        {/* Left: Case Identity */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
            <span
              className="mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              CASE DOSSIER
            </span>
            <span className="mono" style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Engine v{metadata.engine_version}
            </span>
          </div>

          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#f8fafc',
              margin: '0 0 0.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <FileText size={22} color="#38bdf8" />
            <span>{metadata.file_name}</span>
          </h1>

          {/* Metadata badges row */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '1.25rem',
              fontSize: '0.8rem',
              color: '#94a3b8',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="#64748b" />
              <span>{formatDate(metadata.analyzed_at)}</span>
            </span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={14} color="#64748b" />
              <span className="mono">{metadata.execution_time_ms.toFixed(1)} ms</span>
            </span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <HardDrive size={14} color="#64748b" />
              <span className="mono">{formatBytes(metadata.file_size_bytes)}</span>
            </span>

            <span className="mono" style={{ color: '#cbd5e1' }}>
              <strong>{metadata.row_count.toLocaleString()}</strong> rows × <strong>{metadata.column_count}</strong> cols
            </span>

            {targetColumn && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#fb7185',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                }}
              >
                <Target size={12} />
                <span>Target: <strong>{targetColumn}</strong></span>
              </span>
            )}
          </div>
        </div>

        {/* Right: Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onGenerateReport && (
            <button
              onClick={onGenerateReport}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                color: '#07090e',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 15px rgba(6, 182, 212, 0.25)',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.opacity = '0.92';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              <FileText size={16} />
              <span>Generate Report</span>
            </button>
          )}

          <button
            onClick={onNewInvestigation}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#334155';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#1e293b';
            }}
          >
            <ArrowLeft size={16} />
            <span>New Investigation</span>
          </button>
        </div>
      </div>
    </div>
  );
}
