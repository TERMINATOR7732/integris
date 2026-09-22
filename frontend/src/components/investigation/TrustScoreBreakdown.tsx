import { useState } from 'react';
import { ChevronDown, ChevronUp, Scale, CheckCircle2 } from 'lucide-react';
import type { PenaltyItem, TrustScore } from '../../types/integris';
import { CategoryBadge } from '../common/CategoryBadge';

interface TrustScoreBreakdownProps {
  trustScore: TrustScore;
}

export function TrustScoreBreakdown({ trustScore }: TrustScoreBreakdownProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const penalties = trustScore.penalties || [];

  return (
    <div
      style={{
        backgroundColor: '#0c121d',
        borderRadius: '12px',
        border: '1px solid #1e293b',
        marginBottom: '1.5rem',
        overflow: 'hidden',
      }}
    >
      {/* Header bar / accordion toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.1rem 1.5rem',
          backgroundColor: isOpen ? 'rgba(15, 23, 42, 0.6)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: '#f8fafc',
          transition: 'background-color 0.15s ease',
        }}
        onMouseOver={(e) => {
          if (!isOpen) e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
        }}
        onMouseOut={(e) => {
          if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Scale size={16} color="#38bdf8" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                Trust Score Calculation & Deductions Audit
              </span>
              <span
                className="mono"
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: penalties.length > 0 ? 'rgba(244, 63, 94, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                  border: `1px solid ${penalties.length > 0 ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                  color: penalties.length > 0 ? '#fb7185' : '#34d399',
                }}
              >
                {penalties.length} {penalties.length === 1 ? 'penalty' : 'penalties'} itemized
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
              Baseline: 100.0 pts &nbsp;•&nbsp; Total Deductions: -{trustScore.total_deductions.toFixed(1)} pts &nbsp;•&nbsp; Final: {trustScore.overall_score.toFixed(1)} pts
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.8rem' }}>
          <span>{isOpen ? 'Hide Breakdown' : 'Show Breakdown'}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded Table */}
      {isOpen && (
        <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', borderTop: '1px solid #1e293b' }}>
          {penalties.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.9rem',
              }}
            >
              <CheckCircle2 size={18} />
              <span>No integrity deductions recorded. Dataset passed all mathematical and forensic benchmarks.</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.82rem',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #1e293b',
                      color: '#94a3b8',
                      textAlign: 'left',
                      backgroundColor: '#070a10',
                    }}
                  >
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Category</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Finding ID</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Deduction Reason</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {penalties.map((penalty: PenaltyItem, idx: number) => (
                    <tr
                      key={`${penalty.finding_id}-${idx}`}
                      style={{
                        borderBottom: '1px solid rgba(30, 41, 59, 0.5)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.25)',
                      }}
                    >
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <CategoryBadge category={penalty.category} size="sm" />
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span
                          className="mono"
                          style={{
                            fontSize: '0.75rem',
                            color: '#38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.08)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(56, 189, 248, 0.2)',
                          }}
                        >
                          {penalty.finding_id}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                        {penalty.reason}
                      </td>
                      <td
                        className="mono"
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: '#fb7185',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        -{penalty.deduction.toFixed(1)} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    style={{
                      borderTop: '2px solid #334155',
                      fontWeight: 700,
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    }}
                  >
                    <td colSpan={3} style={{ padding: '10px 12px', color: '#f8fafc' }}>
                      Total Score Impact (Penalties Capped at 100.0)
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        color: '#fb7185',
                        fontSize: '0.9rem',
                      }}
                    >
                      -{trustScore.total_deductions.toFixed(1)} pts
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
