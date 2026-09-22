import { Database, Copy, AlertTriangle, HardDrive, CheckCircle2 } from 'lucide-react';
import type { DatasetSummary, InvestigationMetadata } from '../../types/integris';

interface DatasetProfileOverviewProps {
  summary: DatasetSummary;
  metadata: InvestigationMetadata;
}

export function DatasetProfileOverview({ summary, metadata }: DatasetProfileOverviewProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const missingPct = (summary.missing_cell_ratio * 100).toFixed(2);
  const dupPct = (summary.duplicate_row_ratio * 100).toFixed(2);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}
    >
      {/* Total Data Cells */}
      <div
        style={{
          backgroundColor: '#0c121d',
          borderRadius: '10px',
          border: '1px solid #1e293b',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Total Cell Matrix</span>
          <Database size={16} color="#38bdf8" />
        </div>
        <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 }}>
          {summary.total_cells.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
          {metadata.row_count.toLocaleString()} rows × {metadata.column_count} columns
        </div>
      </div>

      {/* Missing Cells */}
      <div
        style={{
          backgroundColor: '#0c121d',
          borderRadius: '10px',
          border: `1px solid ${summary.missing_cells > 0 ? 'rgba(245, 158, 11, 0.3)' : '#1e293b'}`,
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Missing Cells</span>
          {summary.missing_cells > 0 ? (
            <AlertTriangle size={16} color="#fbbf24" />
          ) : (
            <CheckCircle2 size={16} color="#34d399" />
          )}
        </div>
        <div
          className="mono"
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: summary.missing_cells > 0 ? '#fbbf24' : '#34d399',
            lineHeight: 1.1,
          }}
        >
          {summary.missing_cells.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
          {missingPct}% total matrix sparsity
        </div>
      </div>

      {/* Duplicate Rows */}
      <div
        style={{
          backgroundColor: '#0c121d',
          borderRadius: '10px',
          border: `1px solid ${summary.duplicate_rows > 0 ? 'rgba(244, 63, 94, 0.3)' : '#1e293b'}`,
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Duplicate Records</span>
          {summary.duplicate_rows > 0 ? (
            <Copy size={16} color="#f43f5e" />
          ) : (
            <CheckCircle2 size={16} color="#34d399" />
          )}
        </div>
        <div
          className="mono"
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: summary.duplicate_rows > 0 ? '#fb7185' : '#34d399',
            lineHeight: 1.1,
          }}
        >
          {summary.duplicate_rows.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
          {dupPct}% full-record redundancy
        </div>
      </div>

      {/* RAM Footprint */}
      <div
        style={{
          backgroundColor: '#0c121d',
          borderRadius: '10px',
          border: '1px solid #1e293b',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>RAM In-Memory</span>
          <HardDrive size={16} color="#38bdf8" />
        </div>
        <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 }}>
          {formatBytes(summary.memory_usage_bytes)}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
          File: {formatBytes(metadata.file_size_bytes)}
        </div>
      </div>
    </div>
  );
}
