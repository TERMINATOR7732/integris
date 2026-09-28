import { useEffect, useRef, useState } from 'react';
import { X, ShieldAlert, BarChart3, Columns, Scale } from 'lucide-react';
import { getHealth, investigateDataset, IntegrisApiError } from './services/api';
import { runBrowserLocalInvestigation, type LocalProgressUpdate } from './local';
import type { HealthResponse, ForensicDossier, Finding } from './types/integris';
import { Header } from './components/common/Header';
import { DatasetUploader, type InvestigationExecutionMode } from './components/upload/DatasetUploader';
import { InvestigationLoading } from './components/investigation/InvestigationLoading';
import { CaseHeader } from './components/investigation/CaseHeader';
import { ExecutiveVerdictCard } from './components/investigation/ExecutiveVerdictCard';
import { DatasetProfileOverview } from './components/investigation/DatasetProfileOverview';
import { TrustScoreBreakdown } from './components/investigation/TrustScoreBreakdown';
import { FindingsExplorer } from './components/investigation/FindingsExplorer';
import { ColumnDossiers } from './components/investigation/ColumnDossiers';
import { FindingDetailDrawer } from './components/investigation/FindingDetailDrawer';
import { CleanDatasetNotice } from './components/investigation/CleanDatasetNotice';
import { ReportPreviewModal } from './components/report/ReportPreviewModal';

type WorkspaceTab = 'findings' | 'columns' | 'score_breakdown';

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [activeView, setActiveView] = useState<'upload' | 'results'>('upload');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Execution mode state ('online' | 'local')
  const [executionMode, setExecutionMode] = useState<InvestigationExecutionMode>('online');
  const [dossierExecutionMode, setDossierExecutionMode] = useState<InvestigationExecutionMode>('online');
  const [localProgress, setLocalProgress] = useState<LocalProgressUpdate | null>(null);
  const localAbortRef = useRef<AbortController | null>(null);

  // Active investigation state
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [activeTargetColumn, setActiveTargetColumn] = useState<string | undefined>(undefined);
  const [dossier, setDossier] = useState<ForensicDossier | null>(null);

  // Results interaction state
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('findings');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<string | null>(null);
  const [isReportPreviewOpen, setIsReportPreviewOpen] = useState<boolean>(false);

  // Check health on mount and periodically refresh
  useEffect(() => {
    let mounted = true;

    const performHealthCheck = () => {
      getHealth()
        .then((data) => {
          if (mounted) setHealth(data);
        })
        .catch((err) => {
          if (mounted) {
            console.warn('Backend offline or health check failed:', err);
            setHealth(null);
          }
        });
    };

    performHealthCheck();
    const intervalId = setInterval(performHealthCheck, 15000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const handleCancelLocalInvestigation = () => {
    if (localAbortRef.current) {
      localAbortRef.current.abort();
      localAbortRef.current = null;
    }
    setIsLoading(false);
    setLocalProgress(null);
  };

  const handleStartInvestigation = async (
    file: File,
    targetColumn?: string,
    mode?: InvestigationExecutionMode
  ) => {
    const resolvedMode: InvestigationExecutionMode = mode ?? executionMode;
    setExecutionMode(resolvedMode);
    setIsLoading(true);
    setServerError(null);
    setActiveFile(file);
    setActiveTargetColumn(targetColumn);
    setLocalProgress(null);

    if (resolvedMode === 'local') {
      const controller = new AbortController();
      localAbortRef.current = controller;
      try {
        const result = await runBrowserLocalInvestigation({
          file,
          targetColumn,
          signal: controller.signal,
          onProgress: (update: LocalProgressUpdate) => setLocalProgress(update),
        });
        setDossier(result);
        setDossierExecutionMode('local');
        setActiveView('results');
        setActiveTab('findings');
        setSelectedFinding(null);
        setHighlightedColumn(null);
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        if (err instanceof Error) {
          setServerError(err.message);
        } else {
          setServerError('An unexpected error occurred during local browser investigation.');
        }
      } finally {
        localAbortRef.current = null;
        setIsLoading(false);
        setLocalProgress(null);
      }
      return;
    }

    try {
      const result = await investigateDataset(file, { targetColumn });
      setDossier(result);
      setDossierExecutionMode('online');
      setActiveView('results');
      setActiveTab('findings');
      setSelectedFinding(null);
      setHighlightedColumn(null);
    } catch (err: unknown) {
      if (err instanceof IntegrisApiError) {
        setServerError(err.message);
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred during the investigation.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewInvestigation = () => {
    if (localAbortRef.current) {
      localAbortRef.current.abort();
      localAbortRef.current = null;
    }
    setActiveView('upload');
    setSelectedFinding(null);
    setIsReportPreviewOpen(false);
    setServerError(null);
  };

  const handleViewResults = () => {
    if (dossier) {
      setActiveView('results');
    }
  };

  const handleSelectColumnFromFinding = (colName: string) => {
    setHighlightedColumn(colName);
    setActiveTab('columns');
  };

  const isClean =
    dossier !== null &&
    (dossier.trust_score.overall_score >= 95 || dossier.findings.length === 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#070a10', color: '#f8fafc' }}>
      {/* Universal Top Header */}
      <Header
        health={health}
        activeView={activeView}
        hasActiveInvestigation={dossier !== null}
        onNewInvestigation={handleNewInvestigation}
        onViewResults={handleViewResults}
      />

      {/* Main Workspace Container */}
      <main style={{ maxWidth: '1360px', margin: '0 auto', padding: '2rem 1.5rem 4rem 1.5rem' }}>
        {/* Error Alert Banner */}
        {serverError && (
          <div
            style={{
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: '8px',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#fda4af',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ShieldAlert size={20} color="#f43f5e" />
              <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{serverError}</span>
            </div>
            <button
              onClick={() => setServerError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fda4af',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* View 1: Ingestion & Upload */}
        {activeView === 'upload' && (
          <div>
            {isLoading && activeFile ? (
              <InvestigationLoading
                fileName={activeFile.name}
                fileSize={activeFile.size}
                executionMode={executionMode}
                localProgress={localProgress}
                onCancel={executionMode === 'local' ? handleCancelLocalInvestigation : undefined}
              />
            ) : (
              <DatasetUploader
                onStartInvestigation={handleStartInvestigation}
                isLoading={isLoading}
                serverError={serverError}
                executionMode={executionMode}
                onExecutionModeChange={(mode) => {
                  setExecutionMode(mode);
                  setServerError(null);
                }}
              />
            )}
          </div>
        )}

        {/* View 2: Investigation Case Dossier */}
        {activeView === 'results' && dossier && (
          <div>
            {/* Case Dossier Header */}
            <CaseHeader
              metadata={dossier.metadata}
              targetColumn={activeTargetColumn}
              executionMode={dossierExecutionMode}
              onNewInvestigation={handleNewInvestigation}
              onGenerateReport={() => setIsReportPreviewOpen(true)}
            />

            {/* Clean Verification Notice if applicable */}
            {isClean && <CleanDatasetNotice dossier={dossier} />}

            {/* Executive Verdict and Anomaly Tally */}
            <ExecutiveVerdictCard trustScore={dossier.trust_score} findings={dossier.findings} />

            {/* Structural Profiling Metrics Overview */}
            <DatasetProfileOverview summary={dossier.summary} metadata={dossier.metadata} />

            {/* Workspace View Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid #1e293b',
                marginBottom: '1.5rem',
                paddingBottom: '2px',
              }}
            >
              <button
                onClick={() => setActiveTab('findings')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px 6px 0 0',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'findings' ? '#0c121d' : 'transparent',
                  color: activeTab === 'findings' ? '#38bdf8' : '#94a3b8',
                  border: `1px solid ${activeTab === 'findings' ? '#1e293b' : 'transparent'}`,
                  borderBottom: activeTab === 'findings' ? '2px solid #38bdf8' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <BarChart3 size={16} />
                <span>Forensic Findings</span>
                <span
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: activeTab === 'findings' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                    color: activeTab === 'findings' ? '#38bdf8' : '#64748b',
                  }}
                >
                  {dossier.findings.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('columns')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px 6px 0 0',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'columns' ? '#0c121d' : 'transparent',
                  color: activeTab === 'columns' ? '#38bdf8' : '#94a3b8',
                  border: `1px solid ${activeTab === 'columns' ? '#1e293b' : 'transparent'}`,
                  borderBottom: activeTab === 'columns' ? '2px solid #38bdf8' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Columns size={16} />
                <span>Column Profiles</span>
                <span
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: activeTab === 'columns' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                    color: activeTab === 'columns' ? '#38bdf8' : '#64748b',
                  }}
                >
                  {dossier.columns.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('score_breakdown')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px 6px 0 0',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'score_breakdown' ? '#0c121d' : 'transparent',
                  color: activeTab === 'score_breakdown' ? '#38bdf8' : '#94a3b8',
                  border: `1px solid ${activeTab === 'score_breakdown' ? '#1e293b' : 'transparent'}`,
                  borderBottom: activeTab === 'score_breakdown' ? '2px solid #38bdf8' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Scale size={16} />
                <span>Score Ledger</span>
                <span
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor:
                      activeTab === 'score_breakdown' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                    color: activeTab === 'score_breakdown' ? '#38bdf8' : '#64748b',
                  }}
                >
                  {dossier.trust_score.penalties.length}
                </span>
              </button>
            </div>

            {/* Tab 1: Findings Explorer */}
            {activeTab === 'findings' && (
              <FindingsExplorer
                findings={dossier.findings}
                onSelectFinding={(f) => setSelectedFinding(f)}
                onSelectColumn={handleSelectColumnFromFinding}
              />
            )}

            {/* Tab 2: Column Profiles & Invariant Audits */}
            {activeTab === 'columns' && (
              <ColumnDossiers
                columns={dossier.columns}
                highlightColumn={highlightedColumn}
                onClearHighlight={() => setHighlightedColumn(null)}
              />
            )}

            {/* Tab 3: Itemized Score Deductions Ledger */}
            {activeTab === 'score_breakdown' && (
              <TrustScoreBreakdown trustScore={dossier.trust_score} />
            )}

            {/* Slide-out Finding Evidence & Remediation Drawer */}
            <FindingDetailDrawer
              finding={selectedFinding}
              onClose={() => setSelectedFinding(null)}
              onSelectColumn={handleSelectColumnFromFinding}
            />

            {/* Forensic Case Report Preview & Export Dialog */}
            <ReportPreviewModal
              isOpen={isReportPreviewOpen}
              onClose={() => setIsReportPreviewOpen(false)}
              dossier={dossier}
              targetColumn={activeTargetColumn}
            />
          </div>
        )}
      </main>
    </div>
  );
}
