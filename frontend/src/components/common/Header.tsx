import { Shield, PlusCircle, FileText } from 'lucide-react';
import type { HealthResponse } from '../../types/integris';

interface HeaderProps {
  health: HealthResponse | null;
  activeView: 'upload' | 'results';
  hasActiveInvestigation: boolean;
  onNewInvestigation: () => void;
  onViewResults: () => void;
}

export function Header({
  health,
  activeView,
  hasActiveInvestigation,
  onNewInvestigation,
  onViewResults,
}: HeaderProps) {
  const isOnline = health?.status === 'healthy';

  return (
    <header
      style={{
        borderBottom: '1px solid #1e293b',
        backgroundColor: 'rgba(10, 14, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        padding: '0.85rem 1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '1360px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        {/* Brand identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(6, 182, 212, 0.25)',
              flexShrink: 0,
            }}
          >
            <Shield size={20} color="#07090e" strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#f8fafc',
                }}
              >
                INTEGRIS
              </span>
              <span
                className="mono"
                style={{
                  fontSize: '0.65rem',
                  color: '#38bdf8',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                }}
              >
                FORENSICS
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
              Data Integrity & Forensics Platform
            </p>
          </div>
        </div>

        {/* Navigation & Engine Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Engine Status pill */}
          <div
            className="mono"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: '6px',
              backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
              border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
              color: isOnline ? '#34d399' : '#fb7185',
            }}
            title={health ? `${health.service} v${health.version}` : 'Backend offline'}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isOnline ? '#34d399' : '#fb7185',
                boxShadow: isOnline ? '0 0 6px #34d399' : 'none',
              }}
            />
            <span>{isOnline ? 'ENGINE ONLINE' : 'ENGINE OFFLINE'}</span>
          </div>

          {/* Context navigation */}
          {hasActiveInvestigation && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={onViewResults}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  backgroundColor: activeView === 'results' ? '#1e293b' : 'transparent',
                  color: activeView === 'results' ? '#f8fafc' : '#94a3b8',
                  border: `1px solid ${activeView === 'results' ? '#334155' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <FileText size={14} />
                <span>Current Case</span>
              </button>

              <button
                onClick={onNewInvestigation}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  backgroundColor: activeView === 'upload' ? '#1e293b' : 'transparent',
                  color: activeView === 'upload' ? '#f8fafc' : '#94a3b8',
                  border: `1px solid ${activeView === 'upload' ? '#334155' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <PlusCircle size={14} />
                <span>New Investigation</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
