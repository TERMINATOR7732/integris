/**
 * INTEGRIS Local Engine — Master Forensic Investigation Pipeline
 * Mirrors backend/app/engine/pipeline.py with real stage-by-stage progress
 * reporting and cancellation support for browser Web Worker execution.
 */

import type {
  Finding,
  ForensicDossier,
  InvestigationMetadata,
  Recommendation,
  Severity,
} from '../../types/integris';
import {
  detectLocalFileType,
  type SupportedLocalFileType,
} from '../ingestion/detector';
import {
  type ColumnarFrame,
  parseColumnarCsvBytes,
} from '../ingestion/csvParser';
import { profileDataset, roundTo } from './profiler';
import { analyzeCompleteness } from './completeness';
import { analyzeUniqueness } from './uniqueness';
import { analyzeValidity } from './validity';
import { analyzeDistribution } from './distribution';
import { analyzeConsistency } from './consistency';
import { analyzeLeakage } from './leakage';
import { calculateTrustScore } from './scorer';
import { sanitizeForJson } from './sanitizer';

export interface LocalProgressUpdate {
  percent: number;
  stageIndex: number;
  stageLabel: string;
}

export interface LocalInvestigationOptions {
  fileName: string;
  fileSizeBytes?: number;
  targetColumn?: string | null;
  fileType?: SupportedLocalFileType;
  onProgress?: (update: LocalProgressUpdate) => void;
  isCancelled?: () => boolean;
}

export class LocalInvestigationCancelledError extends Error {
  constructor() {
    super('Local investigation was cancelled by the user.');
    this.name = 'LocalInvestigationCancelledError';
  }
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function checkCancel(isCancelled?: () => boolean): void {
  if (isCancelled && isCancelled()) {
    throw new LocalInvestigationCancelledError();
  }
}

/**
 * Runs the complete deterministic forensic pipeline on a parsed `ColumnarFrame`.
 */
export function runLocalForensicPipeline(
  frame: ColumnarFrame,
  options: LocalInvestigationOptions,
  startTimeMs: number = performance.now()
): ForensicDossier {
  const {
    fileName,
    fileSizeBytes = 0,
    targetColumn = null,
    fileType = 'csv',
    onProgress,
    isCancelled,
  } = options;

  checkCancel(isCancelled);
  onProgress?.({
    percent: 25,
    stageIndex: 1,
    stageLabel: 'Profiling column schemas & inferring semantic types',
  });

  // 1. Structural & Semantic Profiling
  const { summary, profiles } = profileDataset(frame);

  checkCancel(isCancelled);
  onProgress?.({
    percent: 50,
    stageIndex: 2,
    stageLabel:
      'Scanning for disguised sentinels, null patterns & PK collisions',
  });

  // 2. Execute Forensic Analyzers in exact reference order
  const rawFindings: Finding[] = [];
  rawFindings.push(...analyzeCompleteness(frame, profiles));
  rawFindings.push(
    ...analyzeUniqueness(frame, profiles, summary.duplicate_rows)
  );
  rawFindings.push(...analyzeValidity(frame, profiles));

  checkCancel(isCancelled);
  onProgress?.({
    percent: 75,
    stageIndex: 3,
    stageLabel:
      "Evaluating statistical distributions, outliers & Benford's Law",
  });

  rawFindings.push(...analyzeDistribution(frame, profiles));
  rawFindings.push(...analyzeConsistency(frame, profiles));

  checkCancel(isCancelled);
  onProgress?.({
    percent: 90,
    stageIndex: 4,
    stageLabel:
      'Auditing cross-column logic, target leakage & computing Trust Score',
  });

  const normalizedTarget =
    targetColumn && targetColumn.trim() !== '' ? targetColumn.trim() : null;
  rawFindings.push(...analyzeLeakage(frame, profiles, normalizedTarget));

  // 3. Deduplicate findings by ID and stably sort by severity
  const seenIds = new Set<string>();
  const dedupedFindings: Finding[] = [];
  for (const f of rawFindings) {
    if (!seenIds.has(f.id)) {
      seenIds.add(f.id);
      dedupedFindings.push(f);
    }
  }

  dedupedFindings.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );

  // 4. Attribute anomalies count back to individual column profiles
  const colAnomalyCounts = new Map<string, number>();
  for (const f of dedupedFindings) {
    for (const colName of f.affected_columns) {
      colAnomalyCounts.set(colName, (colAnomalyCounts.get(colName) ?? 0) + 1);
    }
  }
  for (const p of profiles) {
    p.anomalies_detected = colAnomalyCounts.get(p.name) ?? 0;
  }

  // 5. Compute the Integris Trust Score
  const trustScore = calculateTrustScore(dedupedFindings);

  // 6. Aggregate unique actionable recommendations sorted by priority
  const allRecommendations: Recommendation[] = [];
  for (const f of dedupedFindings) {
    if (f.recommendations) {
      allRecommendations.push(...f.recommendations);
    }
  }
  allRecommendations.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.priority] ?? 99) - (SEVERITY_ORDER[b.priority] ?? 99)
  );

  const elapsedMs = roundTo(Math.max(0.01, performance.now() - startTimeMs), 2);

  const metadata: InvestigationMetadata = {
    file_name: fileName,
    file_size_bytes: fileSizeBytes,
    row_count: frame.rowCount,
    column_count: frame.columnCount,
    analyzed_at: new Date().toISOString(),
    execution_time_ms: elapsedMs,
    engine_version: '0.1.0',
    file_type: fileType,
    sheet_name: null,
    available_sheets: null,
    table_index: null,
    page_count: null,
  };

  const dossier: ForensicDossier = {
    metadata,
    summary,
    trust_score: trustScore,
    findings: dedupedFindings,
    columns: profiles,
    recommendations: allRecommendations,
  };

  checkCancel(isCancelled);
  onProgress?.({
    percent: 100,
    stageIndex: 4,
    stageLabel: 'Forensic dossier complete',
  });

  return sanitizeForJson(dossier);
}

/**
 * Full end-to-end browser-local investigation entrypoint from raw file bytes.
 */
export function investigateBytesLocally(
  fileBytes: Uint8Array,
  options: LocalInvestigationOptions
): ForensicDossier {
  const startTimeMs = performance.now();
  const { fileName, onProgress, isCancelled } = options;

  checkCancel(isCancelled);
  onProgress?.({
    percent: 0,
    stageIndex: 0,
    stageLabel: 'Validating file signature & initializing local worker',
  });

  const detectedType = detectLocalFileType(fileBytes, fileName);

  checkCancel(isCancelled);
  onProgress?.({
    percent: 10,
    stageIndex: 0,
    stageLabel: 'Parsing dataset structure locally in browser memory',
  });

  const frame = parseColumnarCsvBytes(fileBytes, detectedType, (frac) => {
    checkCancel(isCancelled);
    if (frac >= 0.5) {
      onProgress?.({
        percent: 18,
        stageIndex: 0,
        stageLabel: 'Populating columnar buffers in browser memory',
      });
    }
  });

  return runLocalForensicPipeline(
    frame,
    {
      ...options,
      fileSizeBytes: options.fileSizeBytes ?? fileBytes.byteLength,
      fileType: detectedType,
    },
    startTimeMs
  );
}
