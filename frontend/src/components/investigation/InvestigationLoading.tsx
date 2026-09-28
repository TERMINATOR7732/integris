import { useEffect, useState } from 'react';
import { Cpu, CheckCircle2, Loader2, Database, ShieldCheck, XCircle } from 'lucide-react';
import type { LocalProgressUpdate } from '../../local';

interface Stage {
  id: string;
  title: string;
  description: string;
  durationEstimateMs: number;
}

const STAGES: Stage[] = [
  {
    id: 'profiling',
    title: 'Dataset Ingestion & Structural Profiling',
    description: 'Scanning dimensions, memory usage, and inferring column semantic data types',
    durationEstimateMs: 400,
  },
  {
    id: 'completeness',
    title: 'Completeness & Sentinel Value Auditing',
    description: 'Detecting null ratios and hidden placeholder strings (NA, null, -999, ?)',
    durationEstimateMs: 600,
  },
  {
    id: 'uniqueness',
    title: 'Uniqueness & Candidate Key Verification',
    description: 'Identifying exact duplicates and near-duplicate entity rows',
    durationEstimateMs: 500,
  },
  {
    id: 'distribution',
    title: 'Statistical Distribution & Outlier Forensics',
    description: 'Computing skewness, kurtosis, extreme deviations, and Benford first-digit conformance',
    durationEstimateMs: 800,
  },
  {
    id: 'consistency',
    title: 'Cross-Column Consistency & Chronology Checks',
    description: 'Verifying relational logic, temporal inversions, and categorical hierarchies',
    durationEstimateMs: 700,
  },
  {
    id: 'leakage',
    title: 'Target Leakage & Predictive Proxy Analysis',
    description: 'Computing feature-to-target correlations and suspicious predictability',
    durationEstimateMs: 600,
  },
  {
    id: 'scoring',
    title: 'Deterministic Trust Engine Calibration',
    description: 'Synthesizing evidence, compiling deductions, and computing executive verdict',
    durationEstimateMs: 400,
  },
];

interface InvestigationLoadingProps {
  fileName: string;
  fileSize: number;
  executionMode?: 'online' | 'local';
  localProgress?: LocalProgressUpdate | null;
  onCancel?: () => void;
}

function mapLocalStageToIndex(progress: LocalProgressUpdate | null | undefined): number {
  if (!progress) return 0;
  return Math.max(0, Math.min(STAGES.length - 1, progress.stageIndex));
}

export function InvestigationLoading({
  fileName,
  fileSize,
  executionMode = 'online',
  localProgress = null,
  onCancel,
}: InvestigationLoadingProps) {
  const [simulatedStageIdx, setSimulatedStageIdx] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Stage progression timer simulation for visual feedback in Online Mode
  useEffect(() => {
    if (executionMode === 'local') return;
    const interval = setInterval(() => {
      setSimulatedStageIdx((prev) => {
        if (prev < STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 900);

    return () => clearInterval(interval);
  }, [executionMode]);

  const activeStageIdx =
    executionMode === 'local' && localProgress
      ? mapLocalStageToIndex(localProgress)
      : simulatedStageIdx;

  const progressPercent =
    executionMode === 'local'
      ? (localProgress?.percent ?? 5)
      : Math.min(95, Math.round(((activeStageIdx + 1) / STAGES.length) * 100));

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      style={{
        maxWidth: '820px',
        margin: '2.5rem auto',
        padding: '2.5rem',
        borderRadius: '12px',
        backgroundColor: '#0c121d',
        border: '1px solid #1e293b',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7)',
      }}
    >
      {/* Top Banner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          paddingBottom: '1.5rem',
          borderBottom: '1px solid #1e293b',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              backgroundColor:
                executionMode === 'local' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.1)',
              border:
                executionMode === 'local'
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : '1px solid rgba(56, 189, 248, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={24} color={executionMode === 'local' ? '#34d399' : '#38bdf8'} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                {executionMode === 'local'
                  ? 'Browser-Local Forensic Analysis In Progress'
                  : 'Forensic Analysis In Progress'}
              </h2>
            </div>
            <p className="mono" style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Examining{' '}
              <span style={{ color: executionMode === 'local' ? '#34d399' : '#38bdf8' }}>
                {fileName}
              </span>{' '}
              ({formatBytes(fileSize)})
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            className="mono"
            style={{
              fontSize: '0.85rem',
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: '#070a10',
              border: '1px solid #334155',
              color: executionMode === 'local' ? '#34d399' : '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: executionMode === 'local' ? '#34d399' : '#38bdf8',
                animation: 'pulse 1.5s infinite',
              }}
            />
            Elapsed: {elapsedSeconds}s
          </div>

          {executionMode === 'local' && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                color: '#fda4af',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <XCircle size={15} />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar & Active Worker Stage */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
            fontSize: '0.78rem',
          }}
        >
          <span className="mono" style={{ color: '#cbd5e1', fontWeight: 600 }}>
            {executionMode === 'local' && localProgress
              ? localProgress.stageLabel
              : STAGES[activeStageIdx]?.title}
          </span>
          <span
            className="mono"
            style={{
              color: executionMode === 'local' ? '#34d399' : '#38bdf8',
              fontWeight: 700,
            }}
          >
            {progressPercent}%
          </span>
        </div>
        <div
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '999px',
            backgroundColor: '#070a10',
            border: '1px solid #1e293b',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background:
                executionMode === 'local'
                  ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                  : 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      </div>

      {/* Progress pipeline tracker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {STAGES.map((stage, idx) => {
          const isDone = idx < activeStageIdx;
          const isCurrent = idx === activeStageIdx;

          return (
            <div
              key={stage.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                padding: '0.85rem 1.1rem',
                borderRadius: '8px',
                backgroundColor: isCurrent
                  ? 'rgba(56, 189, 248, 0.06)'
                  : isDone
                  ? 'rgba(15, 23, 42, 0.5)'
                  : 'rgba(10, 14, 23, 0.4)',
                border: `1px solid ${
                  isCurrent
                    ? 'rgba(56, 189, 248, 0.3)'
                    : isDone
                    ? 'rgba(30, 41, 59, 0.8)'
                    : 'rgba(30, 41, 59, 0.3)'
                }`,
                transition: 'all 0.25s ease',
              }}
            >
              <div style={{ marginTop: '2px', flexShrink: 0 }}>
                {isDone ? (
                  <CheckCircle2 size={18} color="#34d399" />
                ) : isCurrent ? (
                  <Loader2 size={18} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: '1.5px solid #475569',
                    }}
                  />
                )}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: isCurrent ? '#38bdf8' : isDone ? '#e2e8f0' : '#64748b',
                    }}
                  >
                    {stage.title}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.72rem',
                      color: isDone ? '#34d399' : isCurrent ? '#38bdf8' : '#475569',
                    }}
                  >
                    {isDone ? 'COMPLETED' : isCurrent ? 'EXECUTING...' : 'QUEUED'}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: '0.78rem',
                    color: isCurrent ? '#94a3b8' : isDone ? '#64748b' : '#475569',
                    margin: '3px 0 0 0',
                  }}
                >
                  {stage.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Forensic assurance footer */}
      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          borderRadius: '8px',
          backgroundColor: '#070a10',
          border: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        {executionMode === 'local' ? (
          <>
            <ShieldCheck size={16} color="#34d399" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              <strong>LOCAL PROCESSING — Your file stays in this browser.</strong> Executing all 6 forensic check modules inside an isolated Web Worker with zero network uploads.
            </p>
          </>
        ) : (
          <>
            <Database size={16} color="#64748b" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Executing mathematical and statistical checks in-memory on backend. Zero persistent row storage.
              No LLM hallucinations or synthetic scores.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
