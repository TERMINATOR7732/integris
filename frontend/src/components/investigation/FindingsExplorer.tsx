import { useState, useMemo } from 'react';
import { Search, Filter, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import type { Finding, Severity, FindingCategory } from '../../types/integris';
import { SeverityBadge } from '../common/SeverityBadge';
import { CategoryBadge } from '../common/CategoryBadge';

interface FindingsExplorerProps {
  findings: Finding[];
  onSelectFinding: (finding: Finding) => void;
  onSelectColumn?: (colName: string) => void;
}

const CATEGORIES: { id: FindingCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All Categories' },
  { id: 'completeness', label: 'Completeness' },
  { id: 'uniqueness', label: 'Uniqueness' },
  { id: 'validity', label: 'Validity' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'data_leakage', label: 'Data Leakage' },
  { id: 'schema', label: 'Schema' },
];

export function FindingsExplorer({ findings, onSelectFinding, onSelectColumn }: FindingsExplorerProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<FindingCategory | 'all'>('all');

  // Severity counts for badges
  const severityCounts = useMemo(() => {
    return {
      all: findings.length,
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
      info: findings.filter((f) => f.severity === 'info').length,
    };
  }, [findings]);

  // Filtered findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // Severity filter
      if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'all' && f.category !== selectedCategory) {
        return false;
      }
      // Text search
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesTitle = f.title.toLowerCase().includes(q);
        const matchesDesc = f.description.toLowerCase().includes(q);
        const matchesCol = f.affected_columns.some((c) => c.toLowerCase().includes(q));
        const matchesId = f.id.toLowerCase().includes(q);
        return matchesTitle || matchesDesc || matchesCol || matchesId;
      }
      return true;
    });
  }, [findings, selectedSeverity, selectedCategory, searchQuery]);

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
      {/* Title & Controls Bar */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Forensic Findings Dossier
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
              Showing {filteredFindings.length} of {findings.length} detected integrity anomalies
            </p>
          </div>

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
              minWidth: '260px',
            }}
          >
            <Search size={15} color="#64748b" />
            <input
              type="text"
              placeholder="Search findings, columns, IDs..."
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
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Severity Tabs */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '0.85rem',
          }}
        >
          {(['all', 'critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => {
            const count = severityCounts[sev];
            const isActive = selectedSeverity === sev;

            return (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  backgroundColor: isActive ? '#1e293b' : 'transparent',
                  color: isActive ? '#f8fafc' : '#94a3b8',
                  border: `1px solid ${isActive ? '#38bdf8' : '#1e293b'}`,
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{sev}</span>
                <span
                  className="mono"
                  style={{
                    fontSize: '0.7rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: isActive ? '#0f172a' : 'rgba(30, 41, 59, 0.4)',
                    color: isActive ? '#38bdf8' : '#64748b',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category Filters */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Filter size={12} /> Category:
          </span>
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
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
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Findings List Cards */}
      {filteredFindings.length === 0 ? (
        <div
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.3)',
            borderRadius: '8px',
            border: '1px dashed #334155',
          }}
        >
          {findings.length === 0 ? (
            <div>
              <ShieldCheck size={36} color="#34d399" style={{ margin: '0 auto 0.75rem auto' }} />
              <h3 style={{ fontSize: '1rem', color: '#f8fafc', margin: '0 0 0.25rem 0' }}>
                Zero Anomalies Detected
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
                This dataset satisfied all integrity, consistency, and distribution audits.
              </p>
            </div>
          ) : (
            <div>
              <AlertCircle size={32} color="#64748b" style={{ margin: '0 auto 0.75rem auto' }} />
              <h3 style={{ fontSize: '0.95rem', color: '#f8fafc', margin: '0 0 0.25rem 0' }}>
                No findings match the active filters
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 0.75rem 0' }}>
                Try resetting severity or category filters to view all {findings.length} findings.
              </p>
              <button
                onClick={() => {
                  setSelectedSeverity('all');
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  border: '1px solid #334155',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filteredFindings.map((finding) => (
            <div
              key={finding.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectFinding(finding)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectFinding(finding);
                }
              }}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '1.2rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.45)';
                e.currentTarget.style.borderColor = '#38bdf8';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
                e.currentTarget.style.borderColor = '#1e293b';
              }}
            >
              {/* Header row: Badges, title, affected count */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '0.6rem',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <SeverityBadge severity={finding.severity} size="sm" />
                  <CategoryBadge category={finding.category} size="sm" />
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.7rem',
                      color: '#64748b',
                    }}
                  >
                    {finding.id}
                  </span>
                </div>

                <div
                  className="mono"
                  style={{
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Impact:</span>
                  <strong style={{ color: '#f8fafc' }}>{finding.affected_row_count.toLocaleString()}</strong>
                  <span>rows ({(finding.affected_row_ratio * 100).toFixed(1)}%)</span>
                </div>
              </div>

              {/* Title */}
              <h3
                style={{
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  color: '#f8fafc',
                  margin: '0 0 0.4rem 0',
                }}
              >
                {finding.title}
              </h3>

              {/* Description */}
              <p
                style={{
                  fontSize: '0.85rem',
                  color: '#94a3b8',
                  lineHeight: 1.5,
                  margin: '0 0 0.85rem 0',
                }}
              >
                {finding.description}
              </p>

              {/* Footer: Affected columns & Details Action */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid rgba(30, 41, 59, 0.4)',
                }}
              >
                {/* Affected Column tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginRight: '4px' }}>
                    Columns:
                  </span>
                  {finding.affected_columns.map((col) => (
                    <span
                      key={col}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectColumn?.(col);
                      }}
                      className="mono"
                      style={{
                        fontSize: '0.72rem',
                        backgroundColor: 'rgba(56, 189, 248, 0.08)',
                        border: '1px solid rgba(56, 189, 248, 0.2)',
                        color: '#38bdf8',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        cursor: onSelectColumn ? 'pointer' : 'default',
                      }}
                      title={onSelectColumn ? `Filter column dossiers for ${col}` : col}
                    >
                      {col}
                    </span>
                  ))}
                </div>

                {/* Inspect Action */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '0.78rem',
                  }}
                >
                  <span style={{ color: '#64748b' }}>
                    {finding.evidence.length} evidence • {finding.recommendations.length} actions
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#38bdf8',
                      fontWeight: 600,
                    }}
                  >
                    <span>Inspect</span>
                    <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
