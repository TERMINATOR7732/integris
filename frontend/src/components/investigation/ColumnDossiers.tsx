import { useState, useMemo } from 'react';
import { Columns, Search, Key, Hash, Calendar, Type, CheckCircle, ShieldAlert } from 'lucide-react';
import type { ColumnProfile, SemanticType } from '../../types/integris';

interface ColumnDossiersProps {
  columns: ColumnProfile[];
  highlightColumn?: string | null;
  onClearHighlight?: () => void;
}

export function ColumnDossiers({ columns, highlightColumn, onClearHighlight }: ColumnDossiersProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSemanticType, setSelectedSemanticType] = useState<SemanticType | 'all'>('all');

  // Semantic type icon and label helper
  const getSemanticTypeBadge = (type: SemanticType) => {
    switch (type) {
      case 'numeric_continuous':
      case 'numeric_discrete':
        return {
          label: type === 'numeric_continuous' ? 'Numeric (Cont)' : 'Numeric (Disc)',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.1)',
          border: 'rgba(56, 189, 248, 0.25)',
          icon: <Hash size={12} />,
        };
      case 'categorical':
        return {
          label: 'Categorical',
          color: '#a78bfa',
          bg: 'rgba(167, 139, 250, 0.1)',
          border: 'rgba(167, 139, 250, 0.25)',
          icon: <Type size={12} />,
        };
      case 'datetime':
        return {
          label: 'DateTime',
          color: '#34d399',
          bg: 'rgba(52, 211, 153, 0.1)',
          border: 'rgba(52, 211, 153, 0.25)',
          icon: <Calendar size={12} />,
        };
      case 'identifier':
        return {
          label: 'Identifier (Key)',
          color: '#fbbf24',
          bg: 'rgba(251, 191, 36, 0.1)',
          border: 'rgba(251, 191, 36, 0.25)',
          icon: <Key size={12} />,
        };
      case 'boolean':
        return {
          label: 'Boolean',
          color: '#2dd4bf',
          bg: 'rgba(45, 212, 191, 0.1)',
          border: 'rgba(45, 212, 191, 0.25)',
          icon: <CheckCircle size={12} />,
        };
      default:
        return {
          label: type,
          color: '#94a3b8',
          bg: 'rgba(148, 163, 184, 0.1)',
          border: 'rgba(148, 163, 184, 0.25)',
          icon: <Columns size={12} />,
        };
    }
  };

  const filteredColumns = useMemo(() => {
    return columns.filter((col) => {
      if (selectedSemanticType !== 'all' && col.semantic_type !== selectedSemanticType) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = col.name.toLowerCase().includes(q);
        const matchesDtype = col.inferred_dtype.toLowerCase().includes(q);
        return matchesName || matchesDtype;
      }
      return true;
    });
  }, [columns, selectedSemanticType, searchQuery]);

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
      {/* Title Bar & Search */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Columns size={18} color="#38bdf8" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Column Forensic Profiles
            </h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
            Audited {columns.length} columns for distribution drift, cardinality, null density, and type invariants
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {highlightColumn && (
            <button
              onClick={onClearHighlight}
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#fb7185',
                cursor: 'pointer',
              }}
            >
              Clear filter: {highlightColumn} ✕
            </button>
          )}

          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#070a10',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '6px 12px',
              gap: '8px',
              minWidth: '220px',
            }}
          >
            <Search size={14} color="#64748b" />
            <input
              type="text"
              placeholder="Search column names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: '0.82rem',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
        </div>
      </div>

      {/* Semantic Type Filters */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '1rem',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: '4px' }}>Type:</span>
        {(
          [
            { id: 'all', label: 'All Types' },
            { id: 'numeric_continuous', label: 'Continuous' },
            { id: 'numeric_discrete', label: 'Discrete' },
            { id: 'categorical', label: 'Categorical' },
            { id: 'datetime', label: 'DateTime' },
            { id: 'identifier', label: 'Identifier' },
            { id: 'boolean', label: 'Boolean' },
          ] as const
        ).map((t) => {
          const isActive = selectedSemanticType === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedSemanticType(t.id)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 500,
                cursor: 'pointer',
                backgroundColor: isActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.4)',
                color: isActive ? '#38bdf8' : '#94a3b8',
                border: `1px solid ${isActive ? 'rgba(56, 189, 248, 0.4)' : '#1e293b'}`,
                transition: 'all 0.12s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Columns Grid / Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredColumns.map((col) => {
          const badge = getSemanticTypeBadge(col.semantic_type);
          const isHighlighted = highlightColumn === col.name;
          const nullPct = (col.null_ratio * 100).toFixed(1);

          return (
            <div
              key={col.name}
              style={{
                backgroundColor: isHighlighted ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                border: `1px solid ${isHighlighted ? '#38bdf8' : '#1e293b'}`,
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                {/* Column Name & Semantic Badge */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: '#f8fafc',
                    }}
                  >
                    {col.name}
                  </span>

                  {/* Semantic Type Badge */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: badge.color,
                      backgroundColor: badge.bg,
                      border: `1px solid ${badge.border}`,
                      padding: '2px 7px',
                      borderRadius: '4px',
                    }}
                  >
                    {badge.icon}
                    <span>{badge.label}</span>
                  </span>

                  {/* Physical dtype */}
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.7rem',
                      color: '#64748b',
                      backgroundColor: '#070a10',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    dtype: {col.inferred_dtype}
                  </span>

                  {/* Anomaly Badge */}
                  {col.anomalies_detected > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: '#fb7185',
                        backgroundColor: 'rgba(244, 63, 94, 0.1)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      <ShieldAlert size={12} />
                      <span>{col.anomalies_detected} anomalies</span>
                    </span>
                  )}

                  {/* Candidate identifier */}
                  {col.is_candidate_identifier && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: '#fbbf24',
                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      Primary Key Candidate
                    </span>
                  )}

                  {/* Constant column */}
                  {col.is_constant_or_near_constant && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: '#f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.1)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      Constant / Invariant
                    </span>
                  )}
                </div>

                {/* Right: Null rate bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Nulls:</span>
                  <div
                    style={{
                      flex: 1,
                      height: '6px',
                      backgroundColor: '#1e293b',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, col.null_ratio * 100)}%`,
                        height: '100%',
                        backgroundColor:
                          col.null_ratio === 0
                            ? '#34d399'
                            : col.null_ratio > 0.2
                            ? '#f43f5e'
                            : '#fbbf24',
                      }}
                    />
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: col.null_ratio === 0 ? '#34d399' : '#fb7185',
                      minWidth: '42px',
                      textAlign: 'right',
                    }}
                  >
                    {nullPct}%
                  </span>
                </div>
              </div>

              {/* Stats Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  fontSize: '0.78rem',
                  backgroundColor: 'rgba(7, 10, 16, 0.5)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(30, 41, 59, 0.5)',
                }}
              >
                <div>
                  <span style={{ color: '#64748b' }}>Non-null / Total: </span>
                  <span className="mono" style={{ color: '#cbd5e1' }}>
                    {col.non_null_count.toLocaleString()} / {(col.non_null_count + col.null_count).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span style={{ color: '#64748b' }}>Unique Values: </span>
                  <span className="mono" style={{ color: '#cbd5e1' }}>
                    {col.unique_count.toLocaleString()} ({(col.unique_ratio * 100).toFixed(1)}%)
                  </span>
                </div>

                {col.mean !== null && col.mean !== undefined && (
                  <div>
                    <span style={{ color: '#64748b' }}>Mean (μ): </span>
                    <span className="mono" style={{ color: '#38bdf8' }}>
                      {typeof col.mean === 'number' ? col.mean.toFixed(2) : String(col.mean)}
                    </span>
                  </div>
                )}

                {col.median !== null && col.median !== undefined && (
                  <div>
                    <span style={{ color: '#64748b' }}>Median: </span>
                    <span className="mono" style={{ color: '#38bdf8' }}>
                      {typeof col.median === 'number' ? col.median.toFixed(2) : String(col.median)}
                    </span>
                  </div>
                )}

                {col.std_dev !== null && col.std_dev !== undefined && (
                  <div>
                    <span style={{ color: '#64748b' }}>Std Dev (σ): </span>
                    <span className="mono" style={{ color: '#cbd5e1' }}>
                      {typeof col.std_dev === 'number' ? col.std_dev.toFixed(2) : String(col.std_dev)}
                    </span>
                  </div>
                )}

                {col.min_value !== undefined && col.max_value !== undefined && (
                  <div>
                    <span style={{ color: '#64748b' }}>Range: </span>
                    <span className="mono" style={{ color: '#cbd5e1' }}>
                      [{String(col.min_value)} .. {String(col.max_value)}]
                    </span>
                  </div>
                )}
              </div>

              {/* Sample values preview */}
              {col.sample_values && col.sample_values.length > 0 && (
                <div
                  style={{
                    marginTop: '0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    overflowX: 'auto',
                    fontSize: '0.72rem',
                  }}
                >
                  <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>Sample values:</span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {col.sample_values.slice(0, 6).map((val, sIdx) => (
                      <span
                        key={sIdx}
                        className="mono"
                        style={{
                          backgroundColor: '#070a10',
                          border: '1px solid #1e293b',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          color: '#94a3b8',
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {val === null || val === undefined ? 'null' : String(val)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
