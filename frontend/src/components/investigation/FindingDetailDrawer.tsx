import { useEffect } from 'react';
import { X, CheckSquare, Search, Tag } from 'lucide-react';
import type { Finding, Evidence, Recommendation } from '../../types/integris';
import { SeverityBadge } from '../common/SeverityBadge';
import { CategoryBadge } from '../common/CategoryBadge';

interface FindingDetailDrawerProps {
  finding: Finding | null;
  onClose: () => void;
  onSelectColumn?: (colName: string) => void;
}

export function FindingDetailDrawer({ finding, onClose, onSelectColumn }: FindingDetailDrawerProps) {
  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!finding) return null;

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? val.toLocaleString() : val.toFixed(4);
    }
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          height: '100%',
          backgroundColor: '#0c121d',
          borderLeft: '1px solid #1e293b',
          boxShadow: '-15px 0 35px rgba(0, 0, 0, 0.8)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid #1e293b',
            position: 'sticky',
            top: 0,
            backgroundColor: '#0c121d',
            zIndex: 10,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
              <SeverityBadge severity={finding.severity} size="md" />
              <CategoryBadge category={finding.category} size="md" />
              <span
                className="mono"
                style={{
                  fontSize: '0.72rem',
                  color: '#64748b',
                  backgroundColor: 'rgba(30, 41, 59, 0.6)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                {finding.id}
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0, lineHeight: 1.3 }}>
              {finding.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Finding Narrative Description */}
          <div>
            <h3
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#94a3b8',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                margin: '0 0 0.5rem 0',
              }}
            >
              Forensic Assessment
            </h3>
            <p
              style={{
                fontSize: '0.92rem',
                color: '#e2e8f0',
                lineHeight: 1.6,
                margin: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #1e293b',
              }}
            >
              {finding.description}
            </p>
          </div>

          {/* Scope: Affected Columns & Rows */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                padding: '0.9rem',
                borderRadius: '8px',
                border: '1px solid #1e293b',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Affected Columns ({finding.affected_columns.length})
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {finding.affected_columns.map((col) => (
                  <button
                    key={col}
                    onClick={() => onSelectColumn?.(col)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      color: '#38bdf8',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      cursor: onSelectColumn ? 'pointer' : 'default',
                    }}
                    title={onSelectColumn ? `View column profile for ${col}` : col}
                  >
                    <Tag size={10} />
                    <span>{col}</span>
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                padding: '0.9rem',
                borderRadius: '8px',
                border: '1px solid #1e293b',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Affected Rows & Impact
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                  {finding.affected_row_count.toLocaleString()}
                </span>
                <span className="mono" style={{ fontSize: '0.8rem', color: '#fb7185' }}>
                  ({(finding.affected_row_ratio * 100).toFixed(2)}% of dataset)
                </span>
              </div>
            </div>
          </div>

          {/* Evidence Dossier */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
              <Search size={16} color="#38bdf8" />
              <h3
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#94a3b8',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  margin: 0,
                }}
              >
                Forensic Evidence ({finding.evidence.length})
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {finding.evidence.map((item: Evidence, idx: number) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'rgba(7, 10, 16, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid #1e293b',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8' }}>
                      {item.metric_name}
                    </span>
                    {item.threshold_or_expected !== undefined && item.threshold_or_expected !== null && (
                      <span className="mono" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Expected / Threshold: {formatValue(item.threshold_or_expected)}
                      </span>
                    )}
                  </div>

                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Observed: </span>
                    <span className="mono" style={{ fontSize: '0.85rem', color: '#fb7185', fontWeight: 600 }}>
                      {formatValue(item.observed_value)}
                    </span>
                  </div>

                  {item.details && (
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.4rem 0', lineHeight: 1.5 }}>
                      {item.details}
                    </p>
                  )}

                  {/* Sample Row Indices */}
                  {item.sample_row_indices && item.sample_row_indices.length > 0 && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '3px' }}>
                        Sample Row Indices (0-indexed):
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {item.sample_row_indices.map((rowIdx) => (
                          <span
                            key={rowIdx}
                            className="mono"
                            style={{
                              fontSize: '0.72rem',
                              padding: '1px 6px',
                              borderRadius: '3px',
                              backgroundColor: '#1e293b',
                              color: '#cbd5e1',
                              border: '1px solid #334155',
                            }}
                          >
                            Row {rowIdx}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sample Offending Values */}
                  {item.sample_values && item.sample_values.length > 0 && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '3px' }}>
                        Sample Observed Values:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {item.sample_values.map((v, sIdx) => (
                          <span
                            key={sIdx}
                            className="mono"
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              backgroundColor: 'rgba(244, 63, 94, 0.1)',
                              color: '#fda4af',
                              border: '1px solid rgba(244, 63, 94, 0.25)',
                              maxWidth: '260px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatValue(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actionable Recommendations */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
              <CheckSquare size={16} color="#34d399" />
              <h3
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#94a3b8',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  margin: 0,
                }}
              >
                Actionable Remediation Guidance ({finding.recommendations.length})
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {finding.recommendations.map((rec: Recommendation, rIdx: number) => (
                <div
                  key={rIdx}
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    borderRadius: '8px',
                    border: '1px solid #1e293b',
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                    <SeverityBadge severity={rec.priority} size="sm" />
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>
                      {rec.action}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                    <strong style={{ color: '#cbd5e1' }}>Why: </strong>
                    {rec.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
