import { AlertTriangle, AlertCircle, Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { TrustScore, Finding } from '../../types/integris';
import { VerdictBadge } from '../common/VerdictBadge';

interface ExecutiveVerdictCardProps {
  trustScore: TrustScore;
  findings: Finding[];
}

export function ExecutiveVerdictCard({ trustScore, findings }: ExecutiveVerdictCardProps) {
  // Count findings by severity
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  const isReliable = trustScore.verdict === 'reliable';
  const isCaution = trustScore.verdict === 'caution';

  const verdictAccentColor = isReliable
    ? '#10b981'
    : isCaution
    ? '#f59e0b'
    : '#f43f5e';

  const verdictBgGlow = isReliable
    ? 'rgba(16, 185, 129, 0.12)'
    : isCaution
    ? 'rgba(245, 158, 11, 0.12)'
    : 'rgba(244, 63, 94, 0.12)';

  return (
    <div
      style={{
        backgroundColor: '#0c121d',
        borderRadius: '12px',
        border: `1px solid ${isReliable ? 'rgba(16, 185, 129, 0.3)' : isCaution ? 'rgba(245, 158, 11, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
        padding: '1.75rem',
        marginBottom: '1.5rem',
        boxShadow: `0 8px 30px -10px ${verdictBgGlow}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background subtle indicator bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          backgroundColor: verdictAccentColor,
        }}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 280px) 1fr',
          gap: '2rem',
          alignItems: 'center',
        }}
      >
        {/* Left: Score & Verdict Meter */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            textAlign: 'center',
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: '#94a3b8',
              textTransform: 'uppercase',
              marginBottom: '0.5rem',
            }}
          >
            INTEGRIS TRUST SCORE
          </span>

          {/* Large numeric score */}
          <div
            className="mono"
            style={{
              fontSize: '3.5rem',
              fontWeight: 900,
              lineHeight: 1,
              color: verdictAccentColor,
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              margin: '0.25rem 0',
            }}
          >
            {trustScore.overall_score.toFixed(1)}
            <span style={{ fontSize: '1.2rem', color: '#64748b', fontWeight: 500, marginLeft: '4px' }}>
              /100
            </span>
          </div>

          <div style={{ margin: '0.75rem 0 0.5rem 0' }}>
            <VerdictBadge verdict={trustScore.verdict} grade={trustScore.grade} size="lg" />
          </div>

          <span
            className="mono"
            style={{
              fontSize: '0.75rem',
              color: trustScore.total_deductions > 0 ? '#fb7185' : '#34d399',
              marginTop: '4px',
            }}
          >
            {trustScore.total_deductions > 0
              ? `Total Deductions: -${trustScore.total_deductions.toFixed(1)} pts`
              : 'Zero Deductions (100% Intact)'}
          </span>
        </div>

        {/* Right: Executive Explanation & Findings Count */}
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
              {isReliable ? (
                <ShieldCheck size={20} color="#10b981" />
              ) : (
                <ShieldAlert size={20} color={verdictAccentColor} />
              )}
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Executive Forensic Rationale
              </h2>
            </div>
            <p
              style={{
                fontSize: '0.92rem',
                lineHeight: 1.6,
                color: '#cbd5e1',
                margin: 0,
                backgroundColor: 'rgba(7, 10, 16, 0.4)',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(30, 41, 59, 0.6)',
              }}
            >
              {trustScore.rationale}
            </p>
          </div>

          {/* Severity tally pill counters */}
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#94a3b8',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '0.5rem',
              }}
            >
              Identified Anomaly Distribution
            </span>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: counts.critical > 0 ? 'rgba(225, 29, 72, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  border: `1px solid ${counts.critical > 0 ? 'rgba(225, 29, 72, 0.4)' : '#1e293b'}`,
                  color: counts.critical > 0 ? '#f43f5e' : '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <AlertTriangle size={14} />
                <span>Critical:</span>
                <span className="mono">{counts.critical}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: counts.high > 0 ? 'rgba(249, 115, 22, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  border: `1px solid ${counts.high > 0 ? 'rgba(249, 115, 22, 0.4)' : '#1e293b'}`,
                  color: counts.high > 0 ? '#fb923c' : '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={14} />
                <span>High:</span>
                <span className="mono">{counts.high}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: counts.medium > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  border: `1px solid ${counts.medium > 0 ? 'rgba(245, 158, 11, 0.4)' : '#1e293b'}`,
                  color: counts.medium > 0 ? '#fbbf24' : '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={14} />
                <span>Medium:</span>
                <span className="mono">{counts.medium}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: counts.low > 0 ? 'rgba(56, 189, 248, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                  border: `1px solid ${counts.low > 0 ? 'rgba(56, 189, 248, 0.3)' : '#1e293b'}`,
                  color: counts.low > 0 ? '#38bdf8' : '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <Info size={14} />
                <span>Low:</span>
                <span className="mono">{counts.low}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <span>Total Findings:</span>
                <span className="mono" style={{ color: '#f8fafc' }}>
                  {findings.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
