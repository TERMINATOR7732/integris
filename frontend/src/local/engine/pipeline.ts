/**
 * INTEGRIS Local Engine — Master Forensic Investigation Pipeline
 * Mirrors backend/app/engine/pipeline.py with real stage-by-stage progress
 * reporting and cancellation support for browser Web Worker execution
 * across all 6 supported formats (.csv, .tsv, .txt, .xlsx, .xls, .pdf).
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
  LocalIngestionError,
  sanitizeUploadFilename,
} from '../ingestion/detector';
import {
  type ColumnarFrame,
  parseColumnarCsvBytes,
} from '../ingestion/csvParser';
import { parseExcelBytes } from '../ingestion/excelParser';
import { parsePdfBytes } from '../ingestion/pdfParser';
import { profileDataset, roundTo } from './profiler';
import { analyzeCompleteness } from './completeness';
import { analyzeUniqueness } from './uniqueness';
import { analyzeValidity } from './validity';
import { analyzeDistribution } from './distribution';
import { analyzeConsistency } from './consistency';
import { analyzeLeakage } from './leakage';
import { calculateTrustScore } from './scorer';
import { sanitizeForJson } from './sanitizer';

import {
  LocalInvestigationCancelledError,
  type LocalInvestigationOptions,
  type LocalProgressUpdate,
} from './types';

export { LocalInvestigationCancelledError };
export type { LocalInvestigationOptions, LocalProgressUpdate };

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
    sheetName = null,
    availableSheets = null,
    tableIndex = null,
    pageCount = null,
    onProgress,
    isCancelled,
  } = options;

  const normalizedTarget =
    targetColumn && targetColumn.trim() !== '' ? targetColumn.trim() : null;
  if (normalizedTarget && !frame.columnsByName.has(normalizedTarget)) {
    const colPreview = frame.columnNames.slice(0, 20);
    const suffix =
      frame.columnNames.length > 20
        ? ` (and ${frame.columnNames.length - 20} more)`
        : '';
    throw new LocalIngestionError(
      `Specified target column '${normalizedTarget}' does not exist in dataset. Available columns: [${colPreview.map((c) => `'${c}'`).join(', ')}]${suffix}.`,
      422
    );
  }

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
    file_name: sanitizeUploadFilename(fileName),
    file_size_bytes: fileSizeBytes,
    row_count: frame.rowCount,
    column_count: frame.columnCount,
    analyzed_at: new Date().toISOString(),
    execution_time_ms: elapsedMs,
    engine_version: '0.1.0',
    file_type: fileType,
    sheet_name: sheetName,
    available_sheets: availableSheets,
    table_index: tableIndex,
    page_count: pageCount,
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
 * Synchronous browser-local investigation entrypoint from raw file bytes
 * for `.csv`, `.tsv`, `.txt`, `.xlsx`, and `.xls` files.
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

  if (detectedType === 'xlsx' || detectedType === 'xls') {
    const excelResult = parseExcelBytes(fileBytes, detectedType, (frac) => {
      checkCancel(isCancelled);
      if (frac >= 0.5) {
        onProgress?.({
          percent: 18,
          stageIndex: 0,
          stageLabel: 'Extracting worksheet table into columnar memory',
        });
      }
    });

    return runLocalForensicPipeline(
      excelResult.frame,
      {
        ...options,
        fileSizeBytes: options.fileSizeBytes ?? fileBytes.byteLength,
        fileType: excelResult.fileType,
        sheetName: excelResult.sheetName,
        availableSheets: excelResult.availableSheets,
      },
      startTimeMs
    );
  }

  if (detectedType === 'pdf') {
    throw new LocalIngestionError(
      'PDF extraction requires asynchronous execution via investigateBytesLocallyAsync or runBrowserLocalInvestigation.',
      400
    );
  }

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

/**
 * Asynchronous browser-local investigation entrypoint supporting all 6 formats:
 * `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, and `.pdf`.
 */
export async function investigateBytesLocallyAsync(
  fileBytes: Uint8Array,
  options: LocalInvestigationOptions
): Promise<ForensicDossier> {
  const startTimeMs = performance.now();
  const { fileName, onProgress, isCancelled } = options;

  checkCancel(isCancelled);
  const detectedType = detectLocalFileType(fileBytes, fileName);

  if (detectedType !== 'pdf') {
    return investigateBytesLocally(fileBytes, options);
  }

  onProgress?.({
    percent: 0,
    stageIndex: 0,
    stageLabel: 'Validating PDF signature & initializing local extractor',
  });

  checkCancel(isCancelled);
  onProgress?.({
    percent: 10,
    stageIndex: 0,
    stageLabel: 'Extracting structured tables across PDF pages locally',
  });

  const pdfResult = await parsePdfBytes(fileBytes, (frac) => {
    checkCancel(isCancelled);
    if (frac >= 0.5) {
      onProgress?.({
        percent: 18,
        stageIndex: 0,
        stageLabel: 'Coalescing multi-page PDF table into columnar memory',
      });
    }
  });

  return runLocalForensicPipeline(
    pdfResult.frame,
    {
      ...options,
      fileSizeBytes: options.fileSizeBytes ?? fileBytes.byteLength,
      fileType: 'pdf',
      tableIndex: pdfResult.tableIndex,
      pageCount: pdfResult.pageCount,
    },
    startTimeMs
  );
}
