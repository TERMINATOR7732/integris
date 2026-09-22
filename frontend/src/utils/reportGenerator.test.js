import test from 'node:test';
import assert from 'node:assert';
import {
  formatBytes,
  formatValue,
  generateJsonExport,
  generateMarkdownReport,
} from './reportGenerator.ts';

// Sample mock dossier for test execution
const mockDossier = {
  metadata: {
    file_name: 'test_dataset.csv',
    file_size_bytes: 4096,
    row_count: 50,
    column_count: 5,
    analyzed_at: '2026-09-22T08:00:00Z',
    execution_time_ms: 45.2,
    engine_version: '0.1.0',
  },
  summary: {
    total_cells: 250,
    missing_cells: 10,
    missing_cell_ratio: 0.04,
    duplicate_rows: 2,
    duplicate_row_ratio: 0.04,
    memory_usage_bytes: 12400,
  },
  trust_score: {
    overall_score: 68.1,
    verdict: 'caution',
    grade: 'C',
    total_deductions: 31.9,
    penalties: [
      {
        finding_id: 'FND-VAL-TYPEDRIFT-salary',
        category: 'validity',
        deduction: 12.0,
        reason: 'Type drift detected in salary (HIGH)',
      },
      {
        finding_id: 'FND-UNQ-EXACT-DUPS',
        category: 'uniqueness',
        deduction: 10.0,
        reason: 'Exact duplicate rows detected (HIGH)',
      },
    ],
    rationale: 'Moderate data-quality risks detected. Remediation is advised.',
  },
  findings: [
    {
      id: 'FND-VAL-TYPEDRIFT-salary',
      category: 'validity',
      severity: 'high',
      title: 'Type drift detected in salary',
      description: 'Mixed numeric and text entries in salary column.',
      affected_columns: ['salary'],
      affected_row_count: 2,
      affected_row_ratio: 0.04,
      evidence: [
        {
          metric_name: 'non_numeric_ratio',
          observed_value: 0.04,
          threshold_or_expected: 0.0,
          sample_row_indices: [6, 15],
          sample_values: ['unknown', 'N/A'],
          details: 'Found contaminated text entries in numeric column.',
        },
      ],
      recommendations: [
        {
          finding_id: 'FND-VAL-TYPEDRIFT-salary',
          action: 'Cast salary to float and impute or drop contaminated entries.',
          reason: 'Mixed dtypes prevent numerical modeling.',
          priority: 'high',
        },
      ],
    },
  ],
  columns: [
    {
      name: 'id',
      inferred_dtype: 'str',
      semantic_type: 'identifier',
      non_null_count: 50,
      null_count: 0,
      null_ratio: 0.0,
      unique_count: 50,
      unique_ratio: 1.0,
      sample_values: ['1', '2', '3'],
      anomalies_detected: 0,
      min_value: null,
      max_value: null,
      mean: null,
      median: null,
      std_dev: null,
      memory_bytes: 400,
      is_candidate_identifier: true,
      is_constant_or_near_constant: false,
    },
    {
      name: 'salary',
      inferred_dtype: 'float64',
      semantic_type: 'numeric_continuous',
      non_null_count: 48,
      null_count: 2,
      null_ratio: 0.04,
      unique_count: 40,
      unique_ratio: 0.833,
      sample_values: [50000, 75000, 90000],
      anomalies_detected: 1,
      min_value: 45000,
      max_value: 125000,
      mean: 78500.5,
      median: 75000.0,
      std_dev: 18200.25,
      memory_bytes: 800,
      is_candidate_identifier: false,
      is_constant_or_near_constant: false,
    },
  ],
  recommendations: [
    {
      finding_id: 'FND-VAL-TYPEDRIFT-salary',
      action: 'Cast salary to float and impute or drop contaminated entries.',
      reason: 'Mixed dtypes prevent numerical modeling.',
      priority: 'high',
    },
  ],
};

test('formatBytes helper calculates correctly', () => {
  assert.strictEqual(formatBytes(500), '500 B');
  assert.strictEqual(formatBytes(2048), '2.0 KB');
  assert.strictEqual(formatBytes(2 * 1024 * 1024), '2.00 MB');
});

test('formatValue handles varied datatypes safely', () => {
  assert.strictEqual(formatValue(null), '<NULL>');
  assert.strictEqual(formatValue(undefined), '<NULL>');
  assert.strictEqual(formatValue(12345), '12,345');
  assert.strictEqual(formatValue(3.14159), '3.1416');
  assert.strictEqual(formatValue(true), 'true');
  assert.strictEqual(formatValue('test'), 'test');
  assert.strictEqual(formatValue({ a: 1 }), '{"a":1}');
});

test('generateJsonExport produces valid, faithful JSON', () => {
  const json = generateJsonExport(mockDossier);
  assert.ok(typeof json === 'string');
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.metadata.file_name, 'test_dataset.csv');
  assert.strictEqual(parsed.trust_score.overall_score, 68.1);
  assert.strictEqual(parsed.trust_score.verdict, 'caution');
  assert.strictEqual(parsed.findings.length, 1);
  // Ensure no fabricated raw rows
  assert.strictEqual(parsed.rows, undefined);
});

test('generateMarkdownReport contains all required sections', () => {
  const md = generateMarkdownReport(mockDossier, 'salary');
  assert.ok(md.includes('# INTEGRIS — Forensic Investigation Report'));
  assert.ok(md.includes('## 1. Case Summary'));
  assert.ok(md.includes('test_dataset.csv'));
  assert.ok(md.includes('**Target Column:** `salary`'));
  assert.ok(md.includes('## 2. Executive Verdict'));
  assert.ok(md.includes('68.1 / 100.0'));
  assert.ok(md.includes('CAUTION'));
  assert.ok(md.includes('Grade: **C**') || md.includes('Integrity Grade:** **C**'));
  assert.ok(md.includes('## 3. Trust Score Penalty Ledger'));
  assert.ok(md.includes('FND-VAL-TYPEDRIFT-salary'));
  assert.ok(md.includes('## 4. Forensic Findings Catalog'));
  assert.ok(md.includes('## 5. Forensic Evidence Dossier'));
  assert.ok(md.includes('non_numeric_ratio'));
  assert.ok(md.includes('`6`, `15`')); // Sample row indices
  assert.ok(md.includes('`unknown`, `N/A`')); // Sample offending values
  assert.ok(md.includes('## 6. Actionable Remediation Guidance'));
  assert.ok(md.includes('Cast salary to float'));
  assert.ok(md.includes('## 7. Column Profiles & Invariant Statistics'));
  assert.ok(md.includes('`salary`'));
  assert.ok(md.includes('78500.50')); // Formatted mean
  assert.ok(md.includes('## 8. Dataset Profile Matrix'));
  assert.ok(md.includes('250')); // Total cells
  assert.ok(md.includes('## 9. Forensic Methodology & Investigative Limitations'));
  assert.ok(md.includes('Statistical Signals vs. Proof'));
  assert.ok(md.includes('Zero-Retention Guarantee'));
});

test('generateMarkdownReport handles pristine clean datasets gracefully', () => {
  const cleanDossier = {
    metadata: {
      file_name: 'clean.csv',
      file_size_bytes: 1000,
      row_count: 50,
      column_count: 3,
      analyzed_at: '2026-09-22T08:00:00Z',
      execution_time_ms: 12.5,
      engine_version: '0.1.0',
    },
    summary: {
      total_cells: 150,
      missing_cells: 0,
      missing_cell_ratio: 0.0,
      duplicate_rows: 0,
      duplicate_row_ratio: 0.0,
      memory_usage_bytes: 5000,
    },
    trust_score: {
      overall_score: 100.0,
      verdict: 'reliable',
      grade: 'A+',
      total_deductions: 0.0,
      penalties: [],
      rationale: 'Pristine integrity.',
    },
    findings: [],
    columns: [],
    recommendations: [],
  };

  const md = generateMarkdownReport(cleanDossier);
  assert.ok(md.includes('100.0 / 100.0'));
  assert.ok(md.includes('RELIABLE'));
  assert.ok(md.includes('No score deductions applied'));
  assert.ok(md.includes('Zero integrity anomalies or relational contradictions detected'));
  assert.ok(md.includes('No corrective engineering actions required'));
});
