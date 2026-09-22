import { useEffect } from 'react';
import {
  X,
  Printer,
  FileDown,
  FileCode,
  Shield,
  FileText,
  Search,
} from 'lucide-react';
import type { ForensicDossier } from '../../types/integris';
import {
  generateJsonExport,
  generateMarkdownReport,
  downloadBlob,
  formatBytes,
  formatValue,
} from '../../utils/reportGenerator';
import { SeverityBadge } from '../common/SeverityBadge';
import { CategoryBadge } from '../common/CategoryBadge';
import { VerdictBadge } from '../common/VerdictBadge';

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: ForensicDossier | null;
  targetColumn?: string;
}

export function ReportPreviewModal({
  isOpen,
  onClose,
  dossier,
  targetColumn,
}: ReportPreviewModalProps) {
  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !dossier) return null;

  const baseFileName = dossier.metadata.file_name.replace(/\.[^/.]+$/, '');
  const timestampIso = new Date(dossier.metadata.analyzed_at)
    .toISOString()
    .slice(0, 10);

  const handlePrint = () => {
    window.print();
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdownReport(dossier, targetColumn);
    const filename = `integris-report-${baseFileName}-${timestampIso}.md`;
    downloadBlob(md, filename, 'text/markdown');
  };

  const handleExportJson = () => {
    const json = generateJsonExport(dossier);
    const filename = `integris-dossier-${baseFileName}-${timestampIso}.json`;
    downloadBlob(json, filename, 'application/json');
  };

  const counts = {
    critical: dossier.findings.filter((f) => f.severity === 'critical').length,
    high: dossier.findings.filter((f) => f.severity === 'high').length,
    medium: dossier.findings.filter((f) => f.severity === 'medium').length,
    low: dossier.findings.filter((f) => f.severity === 'low').length,
    info: dossier.findings.filter((f) => f.severity === 'info').length,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-preview-title"
      className="report-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        className="report-modal-container"
        style={{
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '92vh',
          backgroundColor: '#0c121d',
          borderRadius: '12px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Action Bar (Hidden on Print) */}
        <div
          className="no-print"
          style={{
            padding: '1rem 1.5rem',
            backgroundColor: '#070a10',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={18} color="#07090e" strokeWidth={2.4} />
            </div>
            <div>
              <h2
                id="report-preview-title"
                style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}
              >
                Forensic Case Report Preview
              </h2>
              <span className="mono" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {dossier.metadata.file_name} • {dossier.metadata.row_count.toLocaleString()} rows
              </span>
            </div>
          </div>

          {/* Export Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Print report or save to PDF via browser dialog"
            >
              <Printer size={14} />
              <span>Print / Save PDF</span>
            </button>

            <button
              onClick={handleExportMarkdown}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Export report as standalone Markdown file"
            >
              <FileDown size={14} />
              <span>Export Markdown (.md)</span>
            </button>

            <button
              onClick={handleExportJson}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(52, 211, 153, 0.1)',
                color: '#34d399',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Export complete typed forensic dossier as structured JSON"
            >
              <FileCode size={14} />
              <span>Export JSON (.json)</span>
            </button>

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
              aria-label="Close report preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Report Canvas */}
        <div
          className="printable-report"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '2.5rem',
            backgroundColor: '#0c121d',
            color: '#f8fafc',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Document Header */}
          <div
            style={{
              paddingBottom: '1.5rem',
              borderBottom: '2px solid #334155',
              marginBottom: '2rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
              <Shield size={24} color="#38bdf8" />
              <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                INTEGRIS
              </span>
              <span
                className="mono"
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(56, 189, 248, 0.1)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                FORENSIC CASE DOSSIER
              </span>
            </div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.25rem 0', color: '#f8fafc' }}>
              Forensic Investigation Report
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
              Deterministic data integrity, structural consistency, and statistical anomaly audit.
            </p>
          </div>

          {/* 1. Case Summary */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              1. Case Summary
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Dataset File</span>
                <strong className="mono" style={{ color: '#f8fafc' }}>{dossier.metadata.file_name}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Dimensions</span>
                <strong className="mono" style={{ color: '#f8fafc' }}>
                  {dossier.metadata.row_count.toLocaleString()} rows × {dossier.metadata.column_count} cols
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>File Size / Memory</span>
                <strong className="mono" style={{ color: '#f8fafc' }}>
                  {formatBytes(dossier.metadata.file_size_bytes)} ({formatBytes(dossier.summary.memory_usage_bytes)} RAM)
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Execution Time</span>
                <strong className="mono" style={{ color: '#f8fafc' }}>
                  {dossier.metadata.execution_time_ms.toFixed(1)} ms
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Target Column</span>
                <strong className="mono" style={{ color: targetColumn ? '#fb7185' : '#94a3b8' }}>
                  {targetColumn || 'None specified'}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Engine Version</span>
                <strong className="mono" style={{ color: '#f8fafc' }}>v{dossier.metadata.engine_version}</strong>
              </div>
            </div>
          </div>

          {/* 2. Executive Verdict */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              2. Executive Verdict
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(200px, 260px) 1fr',
                gap: '1.5rem',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                alignItems: 'center',
              }}
            >
              <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#070a10', borderRadius: '8px' }}>
                <span className="mono" style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                  INTEGRIS TRUST SCORE
                </span>
                <div
                  className="mono"
                  style={{
                    fontSize: '3rem',
                    fontWeight: 900,
                    lineHeight: 1.1,
                    color:
                      dossier.trust_score.verdict === 'reliable'
                        ? '#10b981'
                        : dossier.trust_score.verdict === 'caution'
                        ? '#f59e0b'
                        : '#f43f5e',
                  }}
                >
                  {dossier.trust_score.overall_score.toFixed(1)}
                  <span style={{ fontSize: '1.1rem', color: '#64748b' }}>/100</span>
                </div>
                <div style={{ margin: '0.5rem 0' }}>
                  <VerdictBadge verdict={dossier.trust_score.verdict} grade={dossier.trust_score.grade} size="md" />
                </div>
                <span className="mono" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  Deductions: -{dossier.trust_score.total_deductions.toFixed(1)} pts
                </span>
              </div>

              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem 0' }}>
                  Executive Rationale
                </h3>
                <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
                  {dossier.trust_score.rationale}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.78rem' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#fb7185' }}>
                    Critical: <strong>{counts.critical}</strong>
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#fb923c' }}>
                    High: <strong>{counts.high}</strong>
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#fbbf24' }}>
                    Medium: <strong>{counts.medium}</strong>
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#38bdf8' }}>
                    Low: <strong>{counts.low}</strong>
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#94a3b8' }}>
                    Info: <strong>{counts.info}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Trust Score Penalty Ledger */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              3. Trust Score Penalty Ledger
            </h2>

            {dossier.trust_score.penalties.length === 0 ? (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  color: '#34d399',
                  fontSize: '0.85rem',
                }}
              >
                No score deductions applied. Dataset passed all mathematical and forensic benchmarks (100.0/100.0).
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left', backgroundColor: '#070a10' }}>
                      <th style={{ padding: '8px 12px' }}>Category</th>
                      <th style={{ padding: '8px 12px' }}>Finding ID</th>
                      <th style={{ padding: '8px 12px' }}>Reason</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Deduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.trust_score.penalties.map((p, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #1e293b',
                          backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.3)',
                        }}
                      >
                        <td style={{ padding: '8px 12px' }}>
                          <CategoryBadge category={p.category} size="sm" />
                        </td>
                        <td style={{ padding: '8px 12px' }} className="mono">
                          {p.finding_id}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{p.reason}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#fb7185' }} className="mono">
                          -{p.deduction.toFixed(1)} pts
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Forensic Findings Catalog */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              4. Forensic Findings Catalog ({dossier.findings.length})
            </h2>

            {dossier.findings.length === 0 ? (
              <p style={{ color: '#34d399', fontSize: '0.85rem' }}>
                Zero integrity anomalies or relational contradictions detected.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {dossier.findings.map((fnd, idx) => (
                  <div
                    key={fnd.id}
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.4)',
                      borderRadius: '8px',
                      border: '1px solid #1e293b',
                      padding: '1.1rem',
                      pageBreakInside: 'avoid',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SeverityBadge severity={fnd.severity} size="sm" />
                        <CategoryBadge category={fnd.category} size="sm" />
                        <span className="mono" style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {fnd.id}
                        </span>
                      </div>
                      <span className="mono" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Impact: {fnd.affected_row_count.toLocaleString()} rows ({(fnd.affected_row_ratio * 100).toFixed(1)}%)
                      </span>
                    </div>

                    <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.4rem 0' }}>
                      {idx + 1}. {fnd.title}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 0.6rem 0' }}>
                      {fnd.description}
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.75rem' }}>
                      <span style={{ color: '#64748b' }}>Affected Columns:</span>
                      {fnd.affected_columns.map((c) => (
                        <span
                          key={c}
                          className="mono"
                          style={{
                            padding: '1px 6px',
                            borderRadius: '3px',
                            backgroundColor: '#070a10',
                            border: '1px solid #1e293b',
                            color: '#38bdf8',
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Forensic Evidence Dossier */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              5. Forensic Evidence Dossier
            </h2>

            {dossier.findings.map((fnd) => (
              <div
                key={fnd.id}
                style={{
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(7, 10, 16, 0.4)',
                  border: '1px solid #1e293b',
                  pageBreakInside: 'avoid',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                  <Search size={14} color="#38bdf8" />
                  <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
                    {fnd.id}: {fnd.title}
                  </span>
                </div>

                {fnd.evidence.map((ev, eIdx) => (
                  <div
                    key={eIdx}
                    style={{
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                      padding: '0.6rem 0',
                      borderTop: eIdx > 0 ? '1px dashed #1e293b' : 'none',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#94a3b8' }}>Metric: </strong>
                      <span className="mono" style={{ color: '#38bdf8' }}>{ev.metric_name}</span> &nbsp;|&nbsp;
                      <strong style={{ color: '#94a3b8' }}> Observed: </strong>
                      <span className="mono" style={{ color: '#fb7185' }}>{formatValue(ev.observed_value)}</span>
                      {ev.threshold_or_expected !== undefined && ev.threshold_or_expected !== null && (
                        <span>
                          &nbsp;|&nbsp; <strong style={{ color: '#94a3b8' }}>Expected: </strong>
                          <span className="mono" style={{ color: '#cbd5e1' }}>{formatValue(ev.threshold_or_expected)}</span>
                        </span>
                      )}
                    </div>
                    {ev.details && <p style={{ margin: '4px 0', color: '#94a3b8' }}>{ev.details}</p>}
                    {ev.sample_row_indices && ev.sample_row_indices.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ color: '#64748b' }}>Sample Rows (0-indexed): </span>
                        <span className="mono" style={{ color: '#cbd5e1' }}>
                          {ev.sample_row_indices.join(', ')}
                        </span>
                      </div>
                    )}
                    {ev.sample_values && ev.sample_values.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ color: '#64748b' }}>Observed Samples: </span>
                        <span className="mono" style={{ color: '#fda4af' }}>
                          {ev.sample_values.map((v) => formatValue(v)).join('  •  ')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 6. Actionable Remediation Guidance */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              6. Actionable Remediation Guidance ({dossier.recommendations.length})
            </h2>

            {dossier.recommendations.length === 0 ? (
              <p style={{ color: '#34d399', fontSize: '0.85rem' }}>
                No corrective engineering actions required.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {dossier.recommendations.map((rec, rIdx) => (
                  <div
                    key={rIdx}
                    style={{
                      padding: '0.85rem 1.1rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid #1e293b',
                      pageBreakInside: 'avoid',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.3rem' }}>
                      <SeverityBadge severity={rec.priority} size="sm" />
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>
                        {rec.action}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                      <strong style={{ color: '#cbd5e1' }}>Rationale: </strong>
                      {rec.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 7. Column Profiles & Invariant Statistics */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              7. Column Profiles & Invariant Statistics
            </h2>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left', backgroundColor: '#070a10' }}>
                    <th style={{ padding: '6px 10px' }}>Column</th>
                    <th style={{ padding: '6px 10px' }}>Dtype</th>
                    <th style={{ padding: '6px 10px' }}>Semantic Type</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Nulls</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Uniques</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Mean (μ)</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Median</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Std Dev (σ)</th>
                    <th style={{ padding: '6px 10px', textAlign: 'center' }}>Range</th>
                    <th style={{ padding: '6px 10px', textAlign: 'center' }}>Anomalies</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.columns.map((col, idx) => (
                    <tr
                      key={col.name}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.3)',
                      }}
                    >
                      <td style={{ padding: '6px 10px' }} className="mono">
                        {col.name}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#94a3b8' }} className="mono">
                        {col.inferred_dtype}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#cbd5e1' }}>{col.semantic_type}</td>
                      <td
                        style={{
                          padding: '6px 10px',
                          textAlign: 'right',
                          color: col.null_ratio > 0 ? '#fb7185' : '#34d399',
                        }}
                        className="mono"
                      >
                        {(col.null_ratio * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#cbd5e1' }} className="mono">
                        {col.unique_count}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#38bdf8' }} className="mono">
                        {col.mean !== null && col.mean !== undefined ? col.mean.toFixed(2) : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#38bdf8' }} className="mono">
                        {col.median !== null && col.median !== undefined ? col.median.toFixed(2) : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#cbd5e1' }} className="mono">
                        {col.std_dev !== null && col.std_dev !== undefined ? col.std_dev.toFixed(2) : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8' }} className="mono">
                        {col.min_value !== null && col.min_value !== undefined && col.max_value !== null && col.max_value !== undefined
                          ? `[${formatValue(col.min_value)} .. ${formatValue(col.max_value)}]`
                          : '-'}
                      </td>
                      <td
                        style={{
                          padding: '6px 10px',
                          textAlign: 'center',
                          color: col.anomalies_detected > 0 ? '#fb7185' : '#64748b',
                          fontWeight: col.anomalies_detected > 0 ? 700 : 400,
                        }}
                        className="mono"
                      >
                        {col.anomalies_detected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 8. Dataset Profile Matrix */}
          <div style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#38bdf8',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              8. Dataset Profile Matrix
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Total Cells</span>
                <strong className="mono" style={{ color: '#f8fafc' }}>
                  {dossier.summary.total_cells.toLocaleString()}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Missing Cells (Sparsity)</span>
                <strong className="mono" style={{ color: dossier.summary.missing_cells > 0 ? '#fbbf24' : '#34d399' }}>
                  {dossier.summary.missing_cells.toLocaleString()} ({(dossier.summary.missing_cell_ratio * 100).toFixed(2)}%)
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Duplicate Rows</span>
                <strong className="mono" style={{ color: dossier.summary.duplicate_rows > 0 ? '#fb7185' : '#34d399' }}>
                  {dossier.summary.duplicate_rows.toLocaleString()} ({(dossier.summary.duplicate_row_ratio * 100).toFixed(2)}%)
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>RAM Footprint</span>
                <strong className="mono" style={{ color: '#38bdf8' }}>
                  {formatBytes(dossier.summary.memory_usage_bytes)}
                </strong>
              </div>
            </div>
          </div>

          {/* 9. Methodology & Forensic Limitations */}
          <div
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              backgroundColor: 'rgba(7, 10, 16, 0.6)',
              border: '1px solid #1e293b',
              fontSize: '0.82rem',
              color: '#94a3b8',
              lineHeight: 1.6,
            }}
          >
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem 0' }}>
              9. Forensic Methodology & Investigative Limitations
            </h3>
            <p style={{ margin: '0 0 0.5rem 0' }}>
              INTEGRIS applies deterministic statistical and relational heuristics across completeness, uniqueness,
              validity, distribution, consistency, and target leakage.
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              <li>
                <strong style={{ color: '#cbd5e1' }}>Statistical Signals vs. Proof:</strong> Outliers and deviations
                flag points for human inquiry; they do not establish intentional fraud or malice.
              </li>
              <li>
                <strong style={{ color: '#cbd5e1' }}>Target Leakage Signals:</strong> High correlations indicate
                predictive proxies that may not be available at real-world inference time.
              </li>
              <li>
                <strong style={{ color: '#cbd5e1' }}>Zero Retention:</strong> In-memory processing only. Original source
                rows were never persisted or transmitted externally.
              </li>
              <li>
                <strong style={{ color: '#cbd5e1' }}>Human-in-the-Loop:</strong> Forensic findings are analytical aids
                for data professionals, not autonomous adjudications.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
