import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { ForensicDossier } from '../../types/integris';

interface CleanDatasetNoticeProps {
  dossier: ForensicDossier;
}

export function CleanDatasetNotice({ dossier }: CleanDatasetNoticeProps) {
  return (
    <div
      style={{
        backgroundColor: 'rgba(16, 185, 129, 0.06)',
        borderRadius: '12px',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ShieldCheck size={22} color="#10b981" />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#34d399', margin: 0 }}>
            Forensic Integrity Certificate: Verified Baseline
          </h3>
          <span
            className="mono"
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
            }}
          >
            GRADE {dossier.trust_score.grade}
          </span>
        </div>

        <p style={{ fontSize: '0.86rem', color: '#cbd5e1', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
          The dataset passed all automated forensic heuristics with a score of{' '}
          <strong style={{ color: '#34d399' }}>{dossier.trust_score.overall_score.toFixed(1)}/100</strong>.
          No critical structural corruption, severe statistical deviations, or target leakage proxies were identified.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.78rem', color: '#94a3b8' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={13} color="#10b981" /> Completeness & Nulls Invariant
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={13} color="#10b981" /> Candidate Keys & Redundancy Intact
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={13} color="#10b981" /> Distribution Deviations Within Normal Tolerances
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={13} color="#10b981" /> Chronological Inversions Absent
          </span>
        </div>
      </div>
    </div>
  );
}
