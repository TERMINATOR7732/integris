import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import module from 'node:module';
import { fileURLToPath } from 'node:url';

// Register Node 24 synchronous resolve hook so extensionless .ts imports in Vite bundler mode work natively
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL
    ) {
      const parentPath = fileURLToPath(context.parentURL);
      const candidateTs = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
      if (fs.existsSync(candidateTs)) {
        return nextResolve(`${specifier}.ts`, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  investigateBytesLocally,
  parseColumnarCsvBytes,
  detectLocalFileType,
  LocalIngestionError,
  LocalInvestigationCancelledError,
  runBrowserLocalInvestigation,
} = await import('./index.ts');

const { generateMarkdownReport } = await import('../utils/reportGenerator.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

test('detectLocalFileType rejects empty files, unsupported extensions, and binary magic bytes', () => {
  assert.throws(
    () => detectLocalFileType(new Uint8Array(0), 'empty.csv'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 400
  );

  const validCsvBytes = new TextEncoder().encode('id,name\n1,Alice\n');
  assert.equal(detectLocalFileType(validCsvBytes, 'data.csv'), 'csv');
  assert.equal(detectLocalFileType(validCsvBytes, 'data.tsv'), 'tsv');
  assert.equal(detectLocalFileType(validCsvBytes, 'data.txt'), 'txt');

  assert.throws(
    () => detectLocalFileType(validCsvBytes, 'workbook.xlsx'),
    (err) =>
      err instanceof LocalIngestionError &&
      err.statusCode === 415 &&
      /Local Browser Mode supports \.csv, \.tsv, and \.txt/.test(err.message)
  );

  assert.throws(
    () => detectLocalFileType(validCsvBytes, 'report.pdf'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 415
  );

  // Spoofed PDF magic bytes with .csv extension
  const spoofedPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  assert.throws(
    () => detectLocalFileType(spoofedPdf, 'spoofed.csv'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 422
  );
});

test('parseColumnarCsvBytes handles RFC 4180 quotes, escaped quotes, embedded newlines, BOM, and prose rejection', () => {
  const csvWithQuotes =
    '\uFEFFid,name,notes,amount\r\n' +
    '1,"Smith, Alice","Said ""Hello""\r\non two lines",1250.50\r\n' +
    '2,"Bob",N/A,500\r\n';

  const frame = parseColumnarCsvBytes(
    new TextEncoder().encode(csvWithQuotes),
    'csv'
  );
  assert.equal(frame.rowCount, 2);
  assert.equal(frame.columnCount, 4);
  assert.deepEqual(frame.columnNames, ['id', 'name', 'notes', 'amount']);

  const idCol = frame.columnsByName.get('id');
  assert.equal(idCol.dtype, 'int64');
  assert.deepEqual(Array.from(idCol.numValues), [1, 2]);

  const nameCol = frame.columnsByName.get('name');
  assert.equal(nameCol.dtype, 'str');
  assert.equal(nameCol.dict[nameCol.codes[0]], 'Smith, Alice');
  assert.equal(nameCol.dict[nameCol.codes[1]], 'Bob');

  const notesCol = frame.columnsByName.get('notes');
  assert.equal(notesCol.dtype, 'str');
  assert.equal(notesCol.dict[notesCol.codes[0]], 'Said "Hello"\r\non two lines');
  assert.equal(notesCol.codes[1], 0); // N/A -> null
  assert.equal(notesCol.nullCount, 1);

  const amountCol = frame.columnsByName.get('amount');
  assert.equal(amountCol.dtype, 'float64');
  assert.deepEqual(Array.from(amountCol.numValues), [1250.5, 500]);

  // Reject unstructured prose .txt
  const proseBytes = new TextEncoder().encode(
    'This is a narrative paragraph without any delimiter structure.\nIt has multiple sentences and lines of plain English prose.\nNo tabular schema exists here.'
  );
  assert.throws(
    () => parseColumnarCsvBytes(proseBytes, 'txt'),
    (err) =>
      err instanceof LocalIngestionError &&
      /Unstructured prose text cannot be analyzed/.test(err.message)
  );
});

test('investigateBytesLocally reports real stage progress, supports cancellation, and generates valid export markdown', () => {
  const csvPath = path.join(repoRoot, 'datasets', 'clean_baseline.csv');
  const bytes = new Uint8Array(fs.readFileSync(csvPath));

  const progressUpdates = [];
  const dossier = investigateBytesLocally(bytes, {
    fileName: 'clean_baseline.csv',
    onProgress: (u) => progressUpdates.push(u.percent),
  });

  assert.ok(progressUpdates.includes(0));
  assert.ok(progressUpdates.includes(10));
  assert.ok(progressUpdates.includes(25));
  assert.ok(progressUpdates.includes(50));
  assert.ok(progressUpdates.includes(75));
  assert.ok(progressUpdates.includes(90));
  assert.ok(progressUpdates.includes(100));

  // Verify Markdown report generator works seamlessly on local dossier
  const md = generateMarkdownReport(dossier);
  assert.match(md, /# INTEGRIS — Forensic Investigation Report/);
  assert.match(md, /clean_baseline\.csv/);

  // Verify cancellation mid-pipeline throws LocalInvestigationCancelledError
  let callCount = 0;
  assert.throws(
    () =>
      investigateBytesLocally(bytes, {
        fileName: 'clean_baseline.csv',
        isCancelled: () => {
          callCount++;
          return callCount >= 3;
        },
      }),
    (err) => err instanceof LocalInvestigationCancelledError
  );
});

test('Parity with Python engine on clean_baseline.csv, moderate_quality.csv, and corrupted_forensic.csv', () => {
  // 1. clean_baseline.csv
  {
    const p = path.join(repoRoot, 'datasets', 'clean_baseline.csv');
    const bytes = new Uint8Array(fs.readFileSync(p));
    const d = investigateBytesLocally(bytes, { fileName: 'clean_baseline.csv' });

    assert.equal(d.metadata.row_count, 50);
    assert.equal(d.metadata.column_count, 12);
    assert.equal(d.summary.total_cells, 600);
    assert.equal(d.summary.missing_cells, 45);
    assert.equal(d.summary.missing_cell_ratio, 0.075);
    assert.equal(d.summary.duplicate_rows, 0);
    assert.equal(d.trust_score.overall_score, 100.0);
    assert.equal(d.trust_score.verdict, 'reliable');
    assert.equal(d.trust_score.grade, 'A+');
    assert.deepEqual(
      d.findings.map((f) => [f.id, f.severity, f.affected_columns]),
      [['FND-CMP-MISS-exit_date', 'info', ['exit_date']]]
    );
  }

  // 2. moderate_quality.csv
  {
    const p = path.join(repoRoot, 'datasets', 'moderate_quality.csv');
    const bytes = new Uint8Array(fs.readFileSync(p));
    const d = investigateBytesLocally(bytes, {
      fileName: 'moderate_quality.csv',
    });

    assert.equal(d.metadata.row_count, 50);
    assert.equal(d.metadata.column_count, 12);
    assert.equal(d.summary.total_cells, 600);
    assert.equal(d.summary.missing_cells, 47);
    assert.equal(d.summary.missing_cell_ratio, 0.078333);
    assert.equal(d.summary.duplicate_rows, 0);
    assert.equal(d.trust_score.overall_score, 68.1);
    assert.equal(d.trust_score.verdict, 'caution');
    assert.equal(d.trust_score.grade, 'C');
    assert.deepEqual(
      d.findings.map((f) => [f.id, f.severity]),
      [
        ['FND-VAL-TYPEDRIFT-salary', 'high'],
        ['FND-VAL-TYPEDRIFT-performance_rating', 'high'],
        ['FND-CMP-SENT-TXT-salary', 'medium'],
        ['FND-CMP-SENT-TXT-performance_rating', 'medium'],
        ['FND-VAL-CAT-CASING-department', 'medium'],
        ['FND-VAL-DATE-FORMAT-hire_date', 'medium'],
        ['FND-CMP-MISS-exit_date', 'info'],
      ]
    );
  }

  // 3. corrupted_forensic.csv (targetColumn = 'attrition')
  {
    const p = path.join(repoRoot, 'datasets', 'corrupted_forensic.csv');
    const bytes = new Uint8Array(fs.readFileSync(p));
    const d = investigateBytesLocally(bytes, {
      fileName: 'corrupted_forensic.csv',
      targetColumn: 'attrition',
    });

    assert.equal(d.metadata.row_count, 50);
    assert.equal(d.metadata.column_count, 13);
    assert.equal(d.summary.total_cells, 650);
    assert.equal(d.summary.missing_cells, 47);
    assert.equal(d.summary.missing_cell_ratio, 0.072308);
    assert.equal(d.summary.duplicate_rows, 1);
    assert.equal(d.summary.duplicate_row_ratio, 0.02);
    assert.equal(d.trust_score.overall_score, 0.0);
    assert.equal(d.trust_score.verdict, 'compromised');
    assert.equal(d.trust_score.grade, 'F');
    assert.deepEqual(
      d.findings.map((f) => [f.id, f.severity]),
      [
        ['FND-UNQ-PK-COLLISION-employee_id', 'critical'],
        ['FND-CNS-TEMP-hire_date-exit_date', 'critical'],
        ['FND-LKG-PROXY-exit_interview_completed', 'critical'],
        ['FND-UNQ-EXACT-DUPS', 'high'],
        ['FND-VAL-TYPEDRIFT-salary', 'high'],
        ['FND-VAL-TYPEDRIFT-performance_rating', 'high'],
        ['FND-CNS-NEG-project_count', 'high'],
        ['FND-LKG-CRAMER-first_name', 'high'],
        ['FND-LKG-CRAMER-job_title', 'high'],
        ['FND-LKG-CRAMER-hire_date', 'high'],
        ['FND-LKG-CRAMER-salary', 'high'],
        ['FND-CMP-SENT-TXT-salary', 'medium'],
        ['FND-CMP-SENT-TXT-performance_rating', 'medium'],
        ['FND-VAL-CAT-CASING-department', 'medium'],
        ['FND-VAL-DATE-FORMAT-hire_date', 'medium'],
        ['FND-DST-OUTLIER-project_count', 'medium'],
        ['FND-CMP-MISS-exit_date', 'info'],
      ]
    );
  }
});

test('Progressive scale parity (1 MB, 5 MB, 10 MB, 45 MB, 48 MB stress datasets)', () => {
  // Progressive 1MB, 5MB, 10MB HR datasets
  const progressiveFiles = [
    [
      path.join(
        repoRoot,
        'integris-test-data/integris-test-data/large/large_hr_dataset_1mb.csv'
      ),
      11189,
    ],
    [
      path.join(
        repoRoot,
        'integris-test-data/integris-test-data/large/large_hr_dataset_5mb.csv'
      ),
      55901,
    ],
    [
      path.join(
        repoRoot,
        'integris-test-data/integris-test-data/large/large_hr_dataset_10mb.csv'
      ),
      111802,
    ],
  ];

  for (const [fPath, expectedRows] of progressiveFiles) {
    if (!fs.existsSync(fPath)) continue;
    const bytes = new Uint8Array(fs.readFileSync(fPath));
    const d = investigateBytesLocally(bytes, {
      fileName: path.basename(fPath),
    });
    assert.equal(d.metadata.row_count, expectedRows);
    assert.equal(d.metadata.column_count, 9);
    assert.equal(d.trust_score.overall_score, 37.1);
    assert.equal(d.trust_score.verdict, 'caution');
    assert.equal(d.trust_score.grade, 'D');
    assert.deepEqual(
      d.findings.map((f) => [f.id, f.severity]),
      [
        ['FND-UNQ-PK-COLLISION-record_id', 'critical'],
        ['FND-CNS-TEMP-hire_date-termination_date', 'critical'],
        ['FND-DST-OUTLIER-annual_salary', 'high'],
        ['FND-UNQ-EXACT-DUPS', 'medium'],
        ['FND-VAL-CAT-CASING-employment_status', 'medium'],
        ['FND-DST-BENFORD-annual_salary', 'medium'],
        ['FND-CMP-MISS-termination_date', 'info'],
      ]
    );
  }

  // 45 MB Forensic Stress Dataset (156,310 rows x 26 columns)
  const stress45Path = path.join(
    repoRoot,
    'integris_45mb_forensic_stress_dataset.csv'
  );
  if (fs.existsSync(stress45Path)) {
    const t0 = performance.now();
    const bytes = new Uint8Array(fs.readFileSync(stress45Path));
    const d = investigateBytesLocally(bytes, {
      fileName: 'integris_45mb_forensic_stress_dataset.csv',
    });
    const elapsedMs = performance.now() - t0;
    console.log(
      `[45MB Stress Test] Completed in ${elapsedMs.toFixed(1)} ms (${d.findings.length} findings)`
    );

    assert.equal(d.metadata.row_count, 156310);
    assert.equal(d.metadata.column_count, 26);
    assert.equal(d.summary.total_cells, 4064060);
    assert.equal(d.summary.missing_cells, 196887);
    assert.equal(d.summary.missing_cell_ratio, 0.048446);
    assert.equal(d.summary.duplicate_rows, 1518);
    assert.equal(d.summary.duplicate_row_ratio, 0.009711);
    assert.equal(d.trust_score.overall_score, 0.0);
    assert.equal(d.trust_score.verdict, 'compromised');
    assert.equal(d.trust_score.grade, 'F');

    const expected45MbFindings = [
      ['FND-UNQ-PK-COLLISION-employee_id', 'critical'],
      ['FND-CNS-TEMP-hire_date-termination_date', 'critical'],
      ['FND-VAL-TYPEDRIFT-income_formatted', 'high'],
      ['FND-DST-OUTLIER-age', 'high'],
      ['FND-DST-OUTLIER-salary', 'high'],
      ['FND-DST-OUTLIER-salary_reported', 'high'],
      ['FND-DST-OUTLIER-bonus', 'high'],
      ['FND-DST-OUTLIER-performance_score', 'high'],
      ['FND-DST-OUTLIER-attendance_pct', 'high'],
      ['FND-DST-OUTLIER-transaction_count', 'high'],
      ['FND-CNS-NEG-age', 'high'],
      ['FND-CMP-SENT-TXT-department', 'medium'],
      ['FND-CMP-SENT-TXT-country', 'medium'],
      ['FND-CMP-SENT-TXT-job_title', 'medium'],
      ['FND-CMP-SENT-NUM-age-9999', 'medium'],
      ['FND-CMP-SENT-NUM-age--999', 'medium'],
      ['FND-CMP-SENT-NUM-performance_score--1', 'medium'],
      ['FND-CMP-SENT-NUM-tenure_years--1', 'medium'],
      ['FND-CMP-SENT-TXT-is_manager', 'medium'],
      ['FND-CMP-SENT-TXT-phone', 'medium'],
      ['FND-CMP-MISS-notes', 'medium'],
      ['FND-UNQ-EXACT-DUPS', 'medium'],
      ['FND-VAL-CAT-CASING-department', 'medium'],
      ['FND-VAL-CAT-CASING-country', 'medium'],
      ['FND-VAL-CAT-CASING-employment_status', 'medium'],
      ['FND-VAL-CAT-CASING-is_manager', 'medium'],
      ['FND-VAL-CAT-CASING-last_review_rating', 'medium'],
      ['FND-CMP-MISS-is_manager', 'low'],
      ['FND-CMP-MISS-termination_date', 'info'],
    ];
    assert.deepEqual(
      d.findings.map((f) => [f.id, f.severity]),
      expected45MbFindings
    );

    // Also verify column profiles match Python reference on all 26 columns
    const expectedCols45Mb = [
      ['employee_id', 'str', 'identifier', 0, 153566, 2],
      ['full_name', 'str', 'categorical', 0, 400, 1],
      ['department', 'str', 'categorical', 2902, 22, 3],
      ['country', 'str', 'categorical', 1477, 25, 3],
      ['job_title', 'str', 'categorical', 940, 18, 2],
      ['employment_status', 'str', 'categorical', 0, 20, 2],
      ['age', 'float64', 'numeric_continuous', 219, 53, 5],
      ['hire_date', 'str', 'datetime', 0, 9269, 2],
      ['termination_date', 'str', 'datetime', 132581, 9785, 3],
      ['promotion_date', 'str', 'datetime', 0, 15740, 1],
      ['salary', 'float64', 'numeric_continuous', 0, 153231, 2],
      ['salary_reported', 'float64', 'numeric_continuous', 0, 154000, 2],
      ['income_formatted', 'str', 'free_text', 4630, 146061, 2],
      ['bonus', 'float64', 'numeric_continuous', 0, 153944, 2],
      ['performance_score', 'float64', 'numeric_continuous', 281, 152901, 3],
      ['attendance_pct', 'float64', 'numeric_continuous', 0, 129327, 2],
      ['tenure_years', 'float64', 'numeric_continuous', 0, 9126, 2],
      ['transaction_count', 'int64', 'numeric_continuous', 0, 1738, 2],
      ['shoe_size_like_metric', 'int64', 'categorical', 0, 7, 1],
      ['is_manager', 'str', 'categorical', 15860, 13, 4],
      ['email', 'str', 'free_text', 0, 153892, 1],
      ['phone', 'str', 'free_text', 1941, 150922, 2],
      ['notes', 'str', 'categorical', 36056, 10, 2],
      ['region_code', 'str', 'categorical', 0, 4, 1],
      ['cost_center', 'int64', 'numeric_continuous', 0, 8999, 1],
      ['last_review_rating', 'str', 'categorical', 0, 7, 2],
    ];
    assert.deepEqual(
      d.columns.map((c) => [
        c.name,
        c.inferred_dtype,
        c.semantic_type,
        c.null_count,
        c.unique_count,
        c.anomalies_detected,
      ]),
      expectedCols45Mb
    );
  }

  // 48 MB 186k x 37 Stress Dataset
  const stress48Path = path.join(
    repoRoot,
    'datasets/forensic_stress_186k_37col.csv'
  );
  if (fs.existsSync(stress48Path)) {
    const t0 = performance.now();
    const bytes = new Uint8Array(fs.readFileSync(stress48Path));
    const d = investigateBytesLocally(bytes, {
      fileName: 'forensic_stress_186k_37col.csv',
    });
    const elapsedMs = performance.now() - t0;
    console.log(
      `[48MB 186k×37 Stress Test] Completed in ${elapsedMs.toFixed(1)} ms`
    );
    assert.equal(d.metadata.row_count, 186251);
    assert.equal(d.metadata.column_count, 37);
    assert.equal(d.trust_score.overall_score, 100.0);
    assert.equal(d.trust_score.verdict, 'reliable');
    assert.equal(d.trust_score.grade, 'A+');
    assert.equal(d.findings.length, 0);
  }
});

test('runBrowserLocalInvestigation never invokes global fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('Network fetch must never be called in Local Mode');
  };

  try {
    const csvPath = path.join(repoRoot, 'datasets', 'clean_baseline.csv');
    const buf = fs.readFileSync(csvPath);
    const fakeFile = {
      name: 'clean_baseline.csv',
      size: buf.byteLength,
      arrayBuffer: async () =>
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };

    const dossier = await runBrowserLocalInvestigation({
      file: fakeFile,
      targetColumn: null,
    });
    assert.equal(fetchCalled, false);
    assert.equal(dossier.trust_score.overall_score, 100.0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
