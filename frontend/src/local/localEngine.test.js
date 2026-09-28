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
  investigateBytesLocallyAsync,
  parseColumnarCsvBytes,
  detectLocalFileType,
  validateXlsxZipArchive,
  LocalIngestionError,
  LocalInvestigationCancelledError,
  runBrowserLocalInvestigation,
} = await import('./index.ts');

const { generateMarkdownReport } = await import('../utils/reportGenerator.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const corpusRoot = path.join(repoRoot, 'integris-test-data', 'integris-test-data');

test('detectLocalFileType validates all 6 formats (.csv, .tsv, .txt, .xlsx, .xls, .pdf), size limits, and magic bytes', () => {
  assert.throws(
    () => detectLocalFileType(new Uint8Array(0), 'empty.csv'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 400
  );

  const validCsvBytes = new TextEncoder().encode('id,name\n1,Alice\n');
  assert.equal(detectLocalFileType(validCsvBytes, 'data.csv'), 'csv');
  assert.equal(detectLocalFileType(validCsvBytes, 'data.tsv'), 'tsv');
  assert.equal(detectLocalFileType(validCsvBytes, 'data.txt'), 'txt');

  // Valid magic bytes for .xlsx, .xls, .pdf
  const xlsxMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const xlsMagic = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  assert.equal(detectLocalFileType(xlsxMagic, 'workbook.xlsx'), 'xlsx');
  assert.equal(detectLocalFileType(xlsMagic, 'legacy.xls'), 'xls');
  assert.equal(detectLocalFileType(pdfMagic, 'report.pdf'), 'pdf');

  // Missing binary signatures on .xlsx, .xls, .pdf
  assert.throws(
    () => detectLocalFileType(validCsvBytes, 'workbook.xlsx'),
    (err) =>
      err instanceof LocalIngestionError &&
      err.statusCode === 422 &&
      /missing OpenXML zip archive signature/.test(err.message)
  );
  assert.throws(
    () => detectLocalFileType(validCsvBytes, 'legacy.xls'),
    (err) =>
      err instanceof LocalIngestionError &&
      err.statusCode === 422 &&
      /missing legacy Excel binary signature/.test(err.message)
  );
  assert.throws(
    () => detectLocalFileType(validCsvBytes, 'report.pdf'),
    (err) =>
      err instanceof LocalIngestionError &&
      err.statusCode === 422 &&
      /missing %PDF header signature/.test(err.message)
  );

  // Unsupported extensions
  assert.throws(
    () => detectLocalFileType(validCsvBytes, 'image.png'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 415
  );

  // Spoofed magic bytes with wrong extension
  assert.throws(
    () => detectLocalFileType(pdfMagic, 'spoofed.csv'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 422
  );
  assert.throws(
    () => detectLocalFileType(xlsxMagic, 'spoofed.pdf'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 422
  );
  assert.throws(
    () => detectLocalFileType(xlsMagic, 'spoofed.csv'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 422
  );

  // Per-format size limit checks (15 MB for PDF, 25 MB for XLSX/XLS, 50 MB for CSV/TSV/TXT)
  const over15MbPdf = new Uint8Array(15 * 1024 * 1024 + 1);
  over15MbPdf.set(pdfMagic, 0);
  assert.throws(
    () => detectLocalFileType(over15MbPdf, 'huge.pdf'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 413
  );

  const over25MbXlsx = new Uint8Array(25 * 1024 * 1024 + 1);
  over25MbXlsx.set(xlsxMagic, 0);
  assert.throws(
    () => detectLocalFileType(over25MbXlsx, 'huge.xlsx'),
    (err) => err instanceof LocalIngestionError && err.statusCode === 413
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

test('Excel (.xlsx & .xls) parity with Python reference engine across all corpus workbooks', () => {
  const excelExpectations = [
    {
      rel: 'xlsx/clean_iot_sensor.xlsx',
      fileType: 'xlsx',
      rows: 600,
      cols: 8,
      sheetName: 'Sheet1',
      availableSheets: ['Sheet1'],
      score: 100.0,
      findings: [],
    },
    {
      rel: 'xlsx/clean_supply_chain.xlsx',
      fileType: 'xlsx',
      rows: 600,
      cols: 12,
      sheetName: 'Sheet1',
      availableSheets: ['Sheet1'],
      score: 100.0,
      findings: [],
    },
    {
      rel: 'xlsx/large_text_payload_workbook.xlsx',
      fileType: 'xlsx',
      rows: 3000,
      cols: 2,
      sheetName: 'BulkText',
      availableSheets: ['BulkText'],
      score: 100.0,
      findings: [],
    },
    {
      rel: 'xlsx/multisheet_workbook.xlsx',
      fileType: 'xlsx',
      rows: 200,
      cols: 5,
      sheetName: 'CleanData',
      availableSheets: [
        'EmptySheet',
        'CleanData',
        'AnomalousData',
        'DateTimeNormalization',
        'WithFormulas',
      ],
      score: 100.0,
      findings: [],
    },
    {
      rel: 'xlsx/unicode_headers_and_sheetname.xlsx',
      fileType: 'xlsx',
      rows: 100,
      cols: 5,
      sheetName: '客户数据',
      availableSheets: ['客户数据'],
      score: 100.0,
      findings: [],
    },
    {
      rel: 'xls/clean_employees_legacy.xls',
      fileType: 'xls',
      rows: 150,
      cols: 5,
      sheetName: 'Employees',
      availableSheets: ['Employees'],
      score: 100.0,
      findings: [],
    },
    {
      rel: 'xls/transactions_with_anomalies_legacy.xls',
      fileType: 'xls',
      rows: 155,
      cols: 4,
      sheetName: 'Transactions',
      availableSheets: ['Transactions'],
      score: 68.8,
      findings: [
        ['FND-UNQ-PK-COLLISION-transaction_id', 'critical'],
        ['FND-VAL-TYPEDRIFT-amount', 'high'],
        ['FND-CMP-SENT-TXT-amount', 'medium'],
        ['FND-UNQ-COMPOSITE-transaction_id-txn_date', 'info'],
      ],
    },
  ];

  for (const exp of excelExpectations) {
    const fullPath = path.join(corpusRoot, exp.rel);
    if (!fs.existsSync(fullPath)) continue;
    const bytes = new Uint8Array(fs.readFileSync(fullPath));
    const d = investigateBytesLocally(bytes, {
      fileName: path.basename(fullPath),
    });

    assert.equal(d.metadata.file_type, exp.fileType);
    assert.equal(d.metadata.row_count, exp.rows);
    assert.equal(d.metadata.column_count, exp.cols);
    assert.equal(d.metadata.sheet_name, exp.sheetName);
    assert.deepEqual(d.metadata.available_sheets, exp.availableSheets);
    assert.equal(d.trust_score.overall_score, exp.score);
    assert.deepEqual(
      d.findings.map((f) => [f.id, f.severity]),
      exp.findings
    );

    if (exp.rel === 'xls/transactions_with_anomalies_legacy.xls') {
      const amountProfile = d.columns.find((c) => c.name === 'amount');
      assert.equal(amountProfile.inferred_dtype, 'object');
      assert.equal(amountProfile.semantic_type, 'free_text');
      assert.equal(amountProfile.null_count, 0);
      assert.equal(amountProfile.unique_count, 147);
    }
  }
});

test('PDF (.pdf) parity with Python reference engine across all single-page and multi-page corpus tables', async () => {
  const pdfExpectations = [
    {
      rel: 'pdf/clean_one_page_table.pdf',
      rows: 28,
      cols: 5,
      pages: 1,
      score: 100.0,
      findings: [],
    },
    {
      rel: 'pdf/clean_multipage_table.pdf',
      rows: 220,
      cols: 5,
      pages: 6,
      score: 94.0,
      findings: [['FND-DST-BENFORD-amount', 'medium']],
    },
    {
      rel: 'pdf/clean_multipage_table_repeated_headers.pdf',
      rows: 220,
      cols: 5,
      pages: 6,
      score: 94.0,
      findings: [['FND-DST-BENFORD-amount', 'medium']],
    },
    {
      rel: 'pdf/anomalous_healthcare_table.pdf',
      rows: 100,
      cols: 5,
      pages: 3,
      score: 68.9,
      findings: [
        ['FND-CNS-TEMP-admit_date-discharge_date', 'critical'],
        ['FND-CNS-NEG-age', 'high'],
        ['FND-CMP-SENT-NUM-age--1', 'medium'],
      ],
    },
    {
      rel: 'pdf/date_heavy_shipment_table.pdf',
      rows: 120,
      cols: 5,
      pages: 4,
      score: 50.0,
      findings: [
        ['FND-CNS-TEMP-order_date-ship_date', 'critical'],
        ['FND-CNS-TEMP-order_date-delivered_date', 'critical'],
        ['FND-CNS-TEMP-ship_date-delivered_date', 'critical'],
      ],
    },
    {
      rel: 'pdf/missing_cells_support_table.pdf',
      rows: 90,
      cols: 4,
      pages: 3,
      score: 97.2,
      findings: [
        ['FND-CMP-MISS-priority', 'low'],
        ['FND-CMP-MISS-resolution_notes', 'low'],
      ],
    },
    {
      rel: 'pdf/mixed_data_types_table.pdf',
      rows: 90,
      cols: 4,
      pages: 3,
      score: 88.0,
      findings: [['FND-CMP-SENT-TXT-value', 'high']],
    },
    {
      rel: 'pdf/numeric_heavy_sensor_table.pdf',
      rows: 150,
      cols: 5,
      pages: 5,
      score: 100.0,
      findings: [],
    },
  ];

  for (const exp of pdfExpectations) {
    const fullPath = path.join(corpusRoot, exp.rel);
    if (!fs.existsSync(fullPath)) continue;
    const bytes = new Uint8Array(fs.readFileSync(fullPath));
    const d = await investigateBytesLocallyAsync(bytes, {
      fileName: path.basename(fullPath),
    });

    assert.equal(d.metadata.file_type, 'pdf');
    assert.equal(d.metadata.row_count, exp.rows);
    assert.equal(d.metadata.column_count, exp.cols);
    assert.equal(d.metadata.page_count, exp.pages);
    assert.equal(d.metadata.table_index, 1);
    assert.equal(d.trust_score.overall_score, exp.score);
    assert.deepEqual(
      d.findings.map((f) => [f.id, f.severity]),
      exp.findings
    );
  }
});

test('Cross-format equivalence across all 6 formats (.csv, .tsv, .txt, .xls, .xlsx, .pdf) for families A, B, and C', async () => {
  const extensions = ['csv', 'tsv', 'txt', 'xls', 'xlsx', 'pdf'];
  const families = [
    {
      prefix: 'family_a_clean',
      rows: 150,
      cols: 6,
      score: 100.0,
      verdict: 'reliable',
      grade: 'A+',
      findings: [],
    },
    {
      prefix: 'family_b_duplicates',
      rows: 162,
      cols: 6,
      score: 66.1,
      verdict: 'caution',
      grade: 'C',
      findings: [
        ['FND-UNQ-PK-COLLISION-order_id', 'critical'],
        ['FND-UNQ-EXACT-DUPS', 'high'],
        ['FND-DST-BENFORD-unit_price', 'medium'],
      ],
    },
    {
      prefix: 'family_c_temporal_anomaly',
      rows: 150,
      cols: 6,
      score: 100.0,
      verdict: 'reliable',
      grade: 'A+',
      findings: [],
    },
  ];

  for (const fam of families) {
    for (const ext of extensions) {
      const fPath = path.join(
        corpusRoot,
        'cross_format',
        `${fam.prefix}.${ext}`
      );
      if (!fs.existsSync(fPath)) continue;
      const bytes = new Uint8Array(fs.readFileSync(fPath));
      const d = await investigateBytesLocallyAsync(bytes, {
        fileName: `${fam.prefix}.${ext}`,
      });

      assert.equal(d.metadata.file_type, ext);
      assert.equal(d.metadata.row_count, fam.rows);
      assert.equal(d.metadata.column_count, fam.cols);
      assert.equal(d.trust_score.overall_score, fam.score);
      assert.equal(d.trust_score.verdict, fam.verdict);
      assert.equal(d.trust_score.grade, fam.grade);
      assert.deepEqual(
        d.findings.map((f) => [f.id, f.severity]),
        fam.findings
      );
    }
  }
});

test('Adversarial, security, and edge-case parity (corrupted files, wrong extensions, decompression bombs, scanned PDFs, duplicate headers, wide datasets)', async () => {
  const rejectFiles = [
    'adversarial/corrupted/corrupted_zip_xlsx.xlsx',
    'adversarial/corrupted/malformed_csv.csv',
    'adversarial/corrupted/malformed_pdf.pdf',
    'adversarial/corrupted/truncated_xlsx.xlsx',
    'adversarial/corrupted/zero_byte_file.xlsx',
    'adversarial/empty/completely_empty.csv',
    'adversarial/empty/header_only.csv',
    'adversarial/wide/wide_1001_columns_over_limit.csv',
    'adversarial/wrong_extension/binary_renamed_txt.txt',
    'adversarial/wrong_extension/plain_text_renamed.pdf',
    'adversarial/wrong_extension/valid_pdf_renamed.xlsx',
    'adversarial/wrong_extension/valid_xlsx_renamed.pdf',
    'adversarial/wrong_extension/valid_xls_renamed.csv',
    'pdf/scanned_image_only_no_text.pdf',
  ];

  for (const rel of rejectFiles) {
    const fullPath = path.join(corpusRoot, rel);
    if (!fs.existsSync(fullPath)) continue;
    const bytes = new Uint8Array(fs.readFileSync(fullPath));
    await assert.rejects(
      () =>
        investigateBytesLocallyAsync(bytes, {
          fileName: path.basename(fullPath),
        }),
      (err) => err instanceof LocalIngestionError
    );
  }

  // Verify scanned PDF gives explicit OCR disabled message
  const scannedPdfPath = path.join(
    corpusRoot,
    'pdf',
    'scanned_image_only_no_text.pdf'
  );
  if (fs.existsSync(scannedPdfPath)) {
    const bytes = new Uint8Array(fs.readFileSync(scannedPdfPath));
    await assert.rejects(
      () =>
        investigateBytesLocallyAsync(bytes, {
          fileName: 'scanned_image_only_no_text.pdf',
        }),
      (err) =>
        err instanceof LocalIngestionError &&
        /OCR is not currently enabled/.test(err.message)
    );
  }

  // Verify ZIP decompression bomb guard on .xlsx (> maxUncompressedBytes)
  const validXlsxPath = path.join(corpusRoot, 'xlsx', 'clean_iot_sensor.xlsx');
  if (fs.existsSync(validXlsxPath)) {
    const validXlsxBytes = new Uint8Array(fs.readFileSync(validXlsxPath));
    assert.throws(
      () => validateXlsxZipArchive(validXlsxBytes, 1024), // 1 KB uncompressed limit
      (err) =>
        err instanceof LocalIngestionError &&
        /potential decompression bomb/.test(err.message)
    );
  }

  // Verify duplicate headers parity (`csv_duplicate_headers_whitespace.csv` & `customer_id_repeated_three_times.csv`)
  const dupWsPath = path.join(
    corpusRoot,
    'adversarial/duplicate_headers/csv_duplicate_headers_whitespace.csv'
  );
  if (fs.existsSync(dupWsPath)) {
    const d = investigateBytesLocally(
      new Uint8Array(fs.readFileSync(dupWsPath)),
      { fileName: 'csv_duplicate_headers_whitespace.csv' }
    );
    assert.deepEqual(
      d.columns.map((c) => c.name),
      ['name', 'name_1', 'NAME']
    );
  }

  const dupExactPath = path.join(
    corpusRoot,
    'adversarial/duplicate_headers/customer_id_repeated_three_times.csv'
  );
  if (fs.existsSync(dupExactPath)) {
    const d = investigateBytesLocally(
      new Uint8Array(fs.readFileSync(dupExactPath)),
      { fileName: 'customer_id_repeated_three_times.csv' }
    );
    assert.deepEqual(
      d.columns.map((c) => c.name),
      ['customer_id', 'customer_id.1', 'customer_id.2', 'order_total']
    );
  }

  // Verify invalid target column throws 422 LocalIngestionError
  const baselinePath = path.join(repoRoot, 'datasets', 'clean_baseline.csv');
  assert.throws(
    () =>
      investigateBytesLocally(new Uint8Array(fs.readFileSync(baselinePath)), {
        fileName: 'clean_baseline.csv',
        targetColumn: 'non_existent_target',
      }),
    (err) =>
      err instanceof LocalIngestionError &&
      err.statusCode === 422 &&
      /Specified target column 'non_existent_target' does not exist/.test(
        err.message
      )
  );
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

test('runBrowserLocalInvestigation never invokes global fetch across CSV, XLSX, XLS, and PDF', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('Network fetch must never be called in Local Mode');
  };

  try {
    const sampleFiles = [
      path.join(repoRoot, 'datasets', 'clean_baseline.csv'),
      path.join(corpusRoot, 'xlsx', 'clean_iot_sensor.xlsx'),
      path.join(corpusRoot, 'xls', 'clean_employees_legacy.xls'),
      path.join(corpusRoot, 'pdf', 'clean_one_page_table.pdf'),
    ];

    for (const fPath of sampleFiles) {
      if (!fs.existsSync(fPath)) continue;
      const buf = fs.readFileSync(fPath);
      const fakeFile = {
        name: path.basename(fPath),
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
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
