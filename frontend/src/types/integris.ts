/**
 * TypeScript type definitions mirroring backend Pydantic models in backend/app/models/report.py.
 * Ensures strict end-to-end contract alignment between frontend and backend.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ExecutiveVerdict = 'reliable' | 'caution' | 'compromised';

export type FindingCategory =
  | 'completeness'
  | 'uniqueness'
  | 'validity'
  | 'distribution'
  | 'consistency'
  | 'data_leakage'
  | 'schema';

export type SemanticType =
  | 'numeric_continuous'
  | 'numeric_discrete'
  | 'categorical'
  | 'datetime'
  | 'identifier'
  | 'free_text'
  | 'boolean'
  | 'unknown';

export interface InvestigationMetadata {
  file_name: string;
  file_size_bytes: number;
  row_count: number;
  column_count: number;
  analyzed_at: string;
  execution_time_ms: number;
  engine_version: string;
}

export interface DatasetSummary {
  total_cells: number;
  missing_cells: number;
  missing_cell_ratio: number;
  duplicate_rows: number;
  duplicate_row_ratio: number;
  memory_usage_bytes: number;
}

export interface ColumnProfile {
  name: string;
  inferred_dtype: string;
  semantic_type: SemanticType;
  non_null_count: number;
  null_count: number;
  null_ratio: number;
  unique_count: number;
  unique_ratio: number;
  sample_values: unknown[];
  anomalies_detected: number;
  min_value?: unknown;
  max_value?: unknown;
  mean?: number | null;
  median?: number | null;
  std_dev?: number | null;
  memory_bytes?: number | null;
  is_candidate_identifier?: boolean;
  is_constant_or_near_constant?: boolean;
}

export interface Evidence {
  metric_name: string;
  observed_value: unknown;
  threshold_or_expected?: unknown;
  sample_row_indices: number[];
  sample_values: unknown[];
  details?: string | null;
}

export interface Recommendation {
  finding_id: string;
  action: string;
  reason: string;
  priority: Severity;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  affected_columns: string[];
  affected_row_count: number;
  affected_row_ratio: number;
  evidence: Evidence[];
  recommendations: Recommendation[];
}

export interface PenaltyItem {
  finding_id: string;
  category: FindingCategory;
  deduction: number;
  reason: string;
}

export interface TrustScore {
  overall_score: number;
  verdict: ExecutiveVerdict;
  grade: string;
  total_deductions: number;
  penalties: PenaltyItem[];
  rationale: string;
}

export interface ForensicDossier {
  metadata: InvestigationMetadata;
  summary: DatasetSummary;
  trust_score: TrustScore;
  findings: Finding[];
  columns: ColumnProfile[];
  recommendations: Recommendation[];
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  engine_status: string;
  timestamp: string;
}

export interface InvestigateOptions {
  targetColumn?: string;
  delimiter?: string;
  customThresholds?: Record<string, number>;
}
