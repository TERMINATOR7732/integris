/**
 * Forensic Report Generation & Export Utilities.
 * Transforms typed ForensicDossier data into publication-ready Markdown and structured JSON.
 * Zero retention, zero fabrication: all metrics derive strictly from backend contract.
 */

import type { ForensicDossier, Evidence, Recommendation, PenaltyItem } from '../types/integris';

/**
 * Format raw byte size into human-readable notation (B, KB, MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format unknown value safely for plain text / markdown output.
 */
export function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '<NULL>';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val.toLocaleString() : val.toFixed(4);
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Serialize forensic dossier into standard indented JSON.
 */
export function generateJsonExport(dossier: ForensicDossier): string {
  return JSON.stringify(dossier, null, 2);
}

/**
 * Generate a comprehensive, professional Markdown report from a ForensicDossier.
 */
export function generateMarkdownReport(dossier: ForensicDossier, targetColumn?: string): string {
  const { metadata, summary, trust_score, findings, columns } = dossier;

  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  const lines: string[] = [];

  // Header & Branding
  lines.push('# INTEGRIS — Forensic Investigation Report');
  lines.push('> *Find what your data is hiding.*');
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Case Summary
  lines.push('## 1. Case Summary');
  lines.push('');
  lines.push(`- **Dataset File:** \`${metadata.file_name}\``);
  lines.push(`- **File Size:** ${formatBytes(metadata.file_size_bytes)}`);
  lines.push(`- **Dimensions:** ${metadata.row_count.toLocaleString()} rows × ${metadata.column_count} columns`);
  lines.push(`- **Target Column:** ${targetColumn ? `\`${targetColumn}\`` : '*None specified*'}`);
  lines.push(`- **Investigation Timestamp:** \`${metadata.analyzed_at}\``);
  lines.push(`- **Engine Execution Time:** ${metadata.execution_time_ms.toFixed(1)} ms`);
  lines.push(`- **Forensic Engine Version:** v${metadata.engine_version}`);
  lines.push('');

  // 2. Executive Verdict
  lines.push('## 2. Executive Verdict');
  lines.push('');
  lines.push(`- **Trust Score:** **${trust_score.overall_score.toFixed(1)} / 100.0**`);
  lines.push(`- **Executive Verdict:** **${trust_score.verdict.toUpperCase()}**`);
  lines.push(`- **Integrity Grade:** **${trust_score.grade}**`);
  lines.push(`- **Total Deductions:** -${trust_score.total_deductions.toFixed(1)} pts`);
  lines.push('');
  lines.push('### Executive Rationale');
  lines.push(`> ${trust_score.rationale}`);
  lines.push('');
  lines.push('### Anomaly Distribution');
  lines.push(`- **Critical Anomalies:** ${counts.critical}`);
  lines.push(`- **High-Severity Anomalies:** ${counts.high}`);
  lines.push(`- **Medium-Severity Anomalies:** ${counts.medium}`);
  lines.push(`- **Low-Severity Anomalies:** ${counts.low}`);
  lines.push(`- **Informational Notices:** ${counts.info}`);
  lines.push(`- **Total Findings Detected:** ${findings.length}`);
  lines.push('');

  // 3. Trust Score Penalty Ledger
  lines.push('## 3. Trust Score Penalty Ledger');
  lines.push('');
  if (!trust_score.penalties || trust_score.penalties.length === 0) {
    lines.push('*No score deductions applied. Dataset satisfied all configured forensic invariants (100.0/100.0).*');
  } else {
    lines.push('| Category | Finding ID | Deduction | Specific Reason |');
    lines.push('| :--- | :--- | :---: | :--- |');
    trust_score.penalties.forEach((p: PenaltyItem) => {
      lines.push(
        `| \`${p.category}\` | \`${p.finding_id}\` | -${p.deduction.toFixed(1)} pts | ${p.reason.replace(/\|/g, '\\|')} |`
      );
    });
    lines.push('');
    lines.push(`**Net Deduction:** -${trust_score.total_deductions.toFixed(1)} pts (Score clamped between 0.0 and 100.0).`);
  }
  lines.push('');

  // 4. Forensic Findings Catalog
  lines.push('## 4. Forensic Findings Catalog');
  lines.push('');
  if (findings.length === 0) {
    lines.push('*Zero integrity anomalies or relational contradictions detected.*');
  } else {
    findings.forEach((fnd, idx) => {
      lines.push(`### 4.${idx + 1}. [${fnd.severity.toUpperCase()}] ${fnd.title}`);
      lines.push(`- **Finding ID:** \`${fnd.id}\``);
      lines.push(`- **Category:** \`${fnd.category}\``);
      lines.push(`- **Severity:** **${fnd.severity.toUpperCase()}**`);
      lines.push(
        `- **Affected Rows:** ${fnd.affected_row_count.toLocaleString()} (${(fnd.affected_row_ratio * 100).toFixed(1)}% of dataset)`
      );
      lines.push(
        `- **Affected Columns:** ${fnd.affected_columns.map((c) => `\`${c}\``).join(', ') || '*Entire Dataset*'}`
      );
      lines.push('');
      lines.push(`**Assessment:**`);
      lines.push(`${fnd.description}`);
      lines.push('');
    });
  }
  lines.push('');

  // 5. Forensic Evidence Dossier
  lines.push('## 5. Forensic Evidence Dossier');
  lines.push('');
  if (findings.length === 0) {
    lines.push('*No offending records or anomalous evidence identified.*');
  } else {
    findings.forEach((fnd, idx) => {
      lines.push(`### 5.${idx + 1}. Evidence for \`${fnd.id}\`: ${fnd.title}`);
      if (!fnd.evidence || fnd.evidence.length === 0) {
        lines.push('- *No discrete metric measurements recorded.*');
      } else {
        fnd.evidence.forEach((ev: Evidence, eIdx: number) => {
          lines.push(`#### Evidence Item ${eIdx + 1}: \`${ev.metric_name}\``);
          lines.push(`- **Observed Measurement:** \`${formatValue(ev.observed_value)}\``);
          if (ev.threshold_or_expected !== undefined && ev.threshold_or_expected !== null) {
            lines.push(`- **Expected Baseline / Threshold:** \`${formatValue(ev.threshold_or_expected)}\``);
          }
          if (ev.details) {
            lines.push(`- **Details:** ${ev.details}`);
          }
          if (ev.sample_row_indices && ev.sample_row_indices.length > 0) {
            lines.push(
              `- **Sample Row Indices (0-indexed):** ${ev.sample_row_indices.map((r) => `\`${r}\``).join(', ')}`
            );
          }
          if (ev.sample_values && ev.sample_values.length > 0) {
            lines.push(
              `- **Representative Sample Values:** ${ev.sample_values.map((v) => `\`${formatValue(v)}\``).join(', ')}`
            );
          }
          lines.push('');
        });
      }
    });
  }
  lines.push('');

  // 6. Actionable Remediation Guidance
  lines.push('## 6. Actionable Remediation Guidance');
  lines.push('');
  if (dossier.recommendations.length === 0) {
    lines.push('*No corrective engineering actions required. Dataset ready for consumption.*');
  } else {
    dossier.recommendations.forEach((rec: Recommendation, rIdx: number) => {
      lines.push(`### 6.${rIdx + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);
      lines.push(`- **Target Finding ID:** \`${rec.finding_id}\``);
      lines.push(`- **Engineering Rationale:** ${rec.reason}`);
      lines.push('');
    });
  }
  lines.push('');

  // 7. Column Profiles & Invariant Statistics
  lines.push('## 7. Column Profiles & Invariant Statistics');
  lines.push('');
  lines.push(
    '| Column Name | Inferred Dtype | Semantic Type | Null Ratio | Unique Count | μ (Mean) | Median | σ (Std Dev) | Min .. Max | Anomalies |'
  );
  lines.push(
    '| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |'
  );
  columns.forEach((col) => {
    const nullPct = `${(col.null_ratio * 100).toFixed(1)}%`;
    const uniqPct = `${col.unique_count} (${(col.unique_ratio * 100).toFixed(1)}%)`;
    const meanStr = col.mean !== null && col.mean !== undefined ? col.mean.toFixed(2) : '-';
    const medianStr = col.median !== null && col.median !== undefined ? col.median.toFixed(2) : '-';
    const stdStr = col.std_dev !== null && col.std_dev !== undefined ? col.std_dev.toFixed(2) : '-';
    const rangeStr =
      col.min_value !== null && col.min_value !== undefined && col.max_value !== null && col.max_value !== undefined
        ? `[${formatValue(col.min_value)} .. ${formatValue(col.max_value)}]`
        : '-';

    lines.push(
      `| \`${col.name}\` | \`${col.inferred_dtype}\` | \`${col.semantic_type}\` | ${nullPct} | ${uniqPct} | ${meanStr} | ${medianStr} | ${stdStr} | ${rangeStr} | ${col.anomalies_detected} |`
    );
  });
  lines.push('');

  // 8. Dataset Profile Matrix
  lines.push('## 8. Dataset Profile Matrix');
  lines.push('');
  lines.push(`- **Total Cells:** ${summary.total_cells.toLocaleString()}`);
  lines.push(
    `- **Missing Cells / Sparsity:** ${summary.missing_cells.toLocaleString()} (${(summary.missing_cell_ratio * 100).toFixed(2)}%)`
  );
  lines.push(
    `- **Duplicate Rows:** ${summary.duplicate_rows.toLocaleString()} (${(summary.duplicate_row_ratio * 100).toFixed(2)}%)`
  );
  lines.push(`- **RAM Memory Usage:** ${formatBytes(summary.memory_usage_bytes)}`);
  lines.push('');

  // 9. Methodology & Forensic Limitations
  lines.push('## 9. Forensic Methodology & Investigative Limitations');
  lines.push('');
  lines.push(
    'INTEGRIS evaluates datasets using deterministic, explainable mathematical and relational heuristics across six key dimensions: completeness, uniqueness, validity, statistical distribution, relational consistency, and target leakage.'
  );
  lines.push('');
  lines.push('### Investigative Limitations:');
  lines.push(
    '1. **Statistical Signals vs. Proof:** Outliers and distribution anomalies are investigative pointers requiring domain context, not proof of data manipulation or fraud.'
  );
  lines.push(
    '2. **Target Leakage Indicators:** High feature-to-target mutual information or correlation flags potential post-decision proxy variables, but operational validity depends on real-world inference pipelines.'
  );
  lines.push(
    '3. **Benford Law Applicability:** First-digit conformance audits are applied only when data spans at least two orders of magnitude in positive, unconstrained financial or transaction figures.'
  );
  lines.push(
    '4. **Zero-Retention Guarantee:** This report was compiled from in-memory processing. The original raw dataset was never stored, persisted, or transmitted to third-party services.'
  );
  lines.push(
    '5. **Human-in-the-Loop:** All forensic conclusions must be corroborated by a qualified data engineer or domain expert before enacting operational or model-training interventions.'
  );
  lines.push('');
  lines.push('---');
  lines.push('*Report compiled by INTEGRIS Data Integrity & Forensics Platform.*');

  return lines.join('\n');
}

/**
 * Triggers a browser download of text/binary data without persisting server-side.
 */
export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}
