import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Lock,
  ArrowRight,
  X,
  Target,
  AlertCircle,
  FileCheck,
} from 'lucide-react';

interface DatasetUploaderProps {
  onStartInvestigation: (file: File, targetColumn?: string) => void;
  isLoading: boolean;
  serverError: string | null;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const FORMAT_LIMITS: Record<string, number> = {
  '.csv': 50 * 1024 * 1024,
  '.tsv': 50 * 1024 * 1024,
  '.txt': 50 * 1024 * 1024,
  '.xlsx': 25 * 1024 * 1024,
  '.xls': 25 * 1024 * 1024,
  '.pdf': 15 * 1024 * 1024,
};

export function DatasetUploader({
  onStartInvestigation,
  isLoading,
  serverError,
}: DatasetUploaderProps) {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [estimatedRows, setEstimatedRows] = useState<number | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<string>('CSV');
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setLocalError(null);

    // Validate extension
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.csv', '.tsv', '.txt', '.xlsx', '.xls', '.pdf'].includes(ext)) {
      setLocalError(`Unsupported file format '${ext}'. Please provide a .csv, .xlsx, .xls, .pdf, or .txt file.`);
      return;
    }

    // Validate size per format
    const limitBytes = FORMAT_LIMITS[ext] || MAX_FILE_SIZE_BYTES;
    if (file.size > limitBytes) {
      setLocalError(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the ${(limitBytes / (1024 * 1024)).toFixed(0)} MB limit for ${ext.toUpperCase()}.`);
      return;
    }

    if (file.size === 0) {
      setLocalError('Selected file is completely empty (0 bytes).');
      return;
    }

    setSelectedFile(file);
    setTargetColumn('');

    // Handle binary formats without text reading
    if (ext === '.xlsx' || ext === '.xls') {
      setDetectedFormat(ext === '.xlsx' ? 'Excel Spreadsheet (.xlsx)' : 'Legacy Excel (.xls)');
      setHeaders([]);
      setEstimatedRows(null);
      return;
    }

    if (ext === '.pdf') {
      setDetectedFormat('PDF Document (.pdf)');
      setHeaders([]);
      setEstimatedRows(null);
      return;
    }

    // Client-side header and structure inspection for text files (.csv, .tsv, .txt)
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        const firstLine = lines[0];
        const isTab = firstLine.includes('\t') && firstLine.split('\t').length > firstLine.split(',').length;
        const isPipe = firstLine.includes('|') && firstLine.split('|').length > firstLine.split(',').length;
        const delim = isTab ? '\t' : (isPipe ? '|' : ',');
        const fmtName = ext === '.txt' ? 'Delimited Text (.txt)' : (isTab ? 'TSV (Tab-separated)' : 'CSV (Comma-separated)');
        setDetectedFormat(fmtName);

        // Extract clean headers
        const parsedHeaders = firstLine
          .split(delim)
          .map((h) => h.replace(/^["']|["']$/g, '').trim())
          .filter((h) => h.length > 0);

        setHeaders(parsedHeaders);
        setEstimatedRows(lines.length > 1 ? lines.length - 1 : 0);
      }
    };
    // Read only first 32 KB for instant header sniffing
    reader.readAsText(file.slice(0, 32768));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setHeaders([]);
    setEstimatedRows(null);
    setTargetColumn('');
    setLocalError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    onStartInvestigation(selectedFile, targetColumn || undefined);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      {/* Hero Headline */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: '#f8fafc',
            lineHeight: 1.15,
            marginBottom: '0.75rem',
          }}
        >
          Find what your data is{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            hiding.
          </span>
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: '#94a3b8',
            maxWidth: '620px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          INTEGRIS investigates whether a dataset can reasonably be trusted before it is used for
          analytics, reporting, or machine learning models.
        </p>
      </div>

      {/* Error alert if any */}
      {(localError || serverError) && (
        <div
          className="fade-in"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#f87171',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 600 }}>Investigation unavailable</div>
            <div style={{ fontSize: '0.825rem', marginTop: '2px', color: '#fca5a5' }}>
              {localError || serverError}
            </div>
          </div>
        </div>
      )}

      {/* Main Upload / Configuration Panel */}
      {!selectedFile ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload dataset file"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          style={{
            position: 'relative',
            padding: '3.5rem 2rem',
            border: `2px dashed ${dragActive ? '#06b6d4' : '#1e293b'}`,
            borderRadius: '14px',
            backgroundColor: dragActive ? 'rgba(6, 182, 212, 0.04)' : '#0d121d',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf"
            onChange={handleChange}
            style={{ display: 'none' }}
          />

          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '12px',
              backgroundColor: '#111827',
              border: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              color: '#38bdf8',
            }}
          >
            <UploadCloud size={30} strokeWidth={2} />
          </div>

          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.35rem' }}>
            Drop your dataset here, or <span style={{ color: '#38bdf8' }}>browse</span>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>
            Supported formats: <span className="mono" style={{ color: '#94a3b8' }}>.CSV, .TSV, .XLSX, .XLS, .PDF, .TXT</span> • Max size: <span className="mono" style={{ color: '#94a3b8' }}>50 MB</span> (Excel <span className="mono" style={{ color: '#94a3b8' }}>25 MB</span>, PDF <span className="mono" style={{ color: '#94a3b8' }}>15 MB</span>)
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#0a0e17',
              border: '1px solid #1e293b',
              fontSize: '0.78rem',
              color: '#94a3b8',
            }}
          >
            <Lock size={13} color="#10b981" />
            <span>Zero-Retention: Dataset is processed in volatile memory and never stored</span>
          </div>
        </div>
      ) : (
        /* Configuration Stage after selection */
        <div
          className="fade-in"
          style={{
            backgroundColor: '#0d121d',
            border: '1px solid #1e293b',
            borderRadius: '14px',
            padding: '1.75rem',
          }}
        >
          {/* File Selected Badge */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: '1.25rem',
              borderBottom: '1px solid #1a2333',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: '#111827',
                  border: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  flexShrink: 0,
                }}
              >
                <FileSpreadsheet size={22} />
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                  {selectedFile.name}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}
                >
                  <span>{formatFileSize(selectedFile.size)}</span>
                  <span>•</span>
                  <span>{detectedFormat}</span>
                  {headers.length > 0 && (
                    <>
                      <span>•</span>
                      <span>{headers.length} columns detected</span>
                    </>
                  )}
                  {estimatedRows !== null && estimatedRows > 0 && (
                    <>
                      <span>•</span>
                      <span>~{estimatedRows.toLocaleString()} rows sampled</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleClear}
              disabled={isLoading}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
              }}
              title="Remove dataset"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Target Column Selector */}
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Target size={16} color="#38bdf8" />
                <label
                  htmlFor="target-column-select"
                  style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}
                >
                  Target column — <span style={{ color: '#94a3b8', fontWeight: 400 }}>optional</span>
                </label>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                Used specifically for potential data-leakage indicators (e.g. target proxies or suspicious feature-target associations). If omitted, standard leakage checks will gracefully skip.
              </p>

              {headers.length > 0 ? (
                <select
                  id="target-column-select"
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#070a12',
                    border: '1px solid #1e293b',
                    color: '#f1f5f9',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">(None — general dataset investigation only)</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="target-column-select"
                  type="text"
                  placeholder="e.g. attrition, fraud_flag, price"
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#070a12',
                    border: '1px solid #1e293b',
                    color: '#f1f5f9',
                    fontSize: '0.85rem',
                  }}
                />
              )}
            </div>

            {/* Quick Preview of Column Headers */}
            {headers.length > 0 && (
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                  DETECTED COLUMN HEADERS:
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '5px',
                    maxHeight: '90px',
                    overflowY: 'auto',
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: '#080c14',
                    border: '1px solid #172030',
                  }}
                >
                  {headers.map((h, idx) => (
                    <span
                      key={idx}
                      className="mono"
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#111827',
                        border: '1px solid #1e293b',
                        color: h === targetColumn ? '#38bdf8' : '#cbd5e1',
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Submit CTA */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  backgroundColor: '#0284c7',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 15px rgba(2, 132, 199, 0.3)',
                }}
              >
                <span>Run Investigation</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Architectural Capabilities Footer */}
      <div
        style={{
          marginTop: '3.5rem',
          paddingTop: '2rem',
          borderTop: '1px solid #1e293b',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f1f5f9', fontWeight: 600, fontSize: '0.85rem' }}>
            <FileCheck size={16} color="#06b6d4" />
            <span>Deterministic Checks</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
            Quantified statistical tests (IQR, modified Z-scores, Benford conformity, Cramér's V) with zero black-box heuristics.
          </p>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f1f5f9', fontWeight: 600, fontSize: '0.85rem' }}>
            <Lock size={16} color="#10b981" />
            <span>Zero-Retention Security</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
            Data streams are analyzed strictly in volatile memory. No dataset rows are ever persisted to disk, databases, or third parties.
          </p>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f1f5f9', fontWeight: 600, fontSize: '0.85rem' }}>
            <Target size={16} color="#a855f7" />
            <span>Integris Trust Score</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
            Transparent 0–100 score with explainable penalty itemization and column caps to prevent single-feature destruction.
          </p>
        </div>
      </div>
    </div>
  );
}
