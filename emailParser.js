/**
 * emailParser.js
 * Reads email addresses from .txt, .csv, or .xlsx files.
 */

const fs   = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(str) {
  return EMAIL_RE.test((str || '').trim());
}

function dedup(arr) {
  return [...new Set(arr.map(e => e.toLowerCase().trim()).filter(isValidEmail))];
}

// ── parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse a plain-text file — one email per line.
 * Also handles comma/semicolon-separated lines.
 */
function parseTxt(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const emails = [];
  for (const line of raw.split(/\r?\n/)) {
    // split on comma, semicolon, tab, or whitespace
    const parts = line.split(/[,;\t\s]+/);
    for (const p of parts) {
      if (isValidEmail(p.trim())) emails.push(p.trim());
    }
  }
  return dedup(emails);
}

/**
 * Parse a CSV file.  Looks through every column of every row for emails.
 * No external dependency — pure regex scan so it works even on weirdly
 * formatted CSVs.
 */
function parseCsv(filePath) {
  const { parse } = require('csv-parse/sync');
  const raw     = fs.readFileSync(filePath, 'utf8');
  const records = parse(raw, { relax_column_count: true, skip_empty_lines: true });
  const emails  = [];
  for (const row of records) {
    for (const cell of row) {
      if (isValidEmail(cell)) emails.push(cell.trim());
    }
  }
  return dedup(emails);
}

/**
 * Parse an Excel file (.xlsx / .xls).
 * Scans every sheet, every cell.
 */
function parseXlsx(filePath) {
  const XLSX   = require('xlsx');
  const wb     = XLSX.readFile(filePath);
  const emails = [];
  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (const row of data) {
      for (const cell of row) {
        const val = String(cell).trim();
        if (isValidEmail(val)) emails.push(val);
      }
    }
  }
  return dedup(emails);
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * @param {string} filePath  Absolute or relative path to the email list file.
 * @returns {string[]}       Deduplicated, validated email addresses.
 */
function loadEmails(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Email file not found: ${abs}`);
  }

  const ext = path.extname(abs).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.text':
      return parseTxt(abs);

    case '.csv':
    case '.tsv':
      return parseCsv(abs);

    case '.xlsx':
    case '.xls':
      return parseXlsx(abs);

    default:
      // Try treating it as plain text as a last resort
      console.warn(`Unknown extension "${ext}" — attempting plain-text parse.`);
      return parseTxt(abs);
  }
}

module.exports = { loadEmails };
