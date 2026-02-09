import { parse } from "csv-parse/sync";
import * as iconv from "iconv-lite";
import {
  type CsvRow,
  csvRowSchema,
  normalizeCompanyName,
  deduplicateBy,
} from "@sales-ai/core";

/**
 * Detect whether a buffer is Shift_JIS encoded.
 *
 * Heuristic:
 *  1. If the buffer starts with a UTF-8 BOM (EF BB BF) -> UTF-8
 *  2. If the buffer contains byte sequences typical of Shift_JIS
 *     (lead byte 0x81-0x9F or 0xE0-0xEF followed by trail byte 0x40-0x7E or 0x80-0xFC)
 *     AND does NOT look like valid UTF-8 multi-byte -> Shift_JIS
 *  3. Otherwise assume UTF-8
 */
function detectEncoding(buffer: Buffer): "utf-8" | "Shift_JIS" {
  // Check for UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf-8";
  }

  let sjisScore = 0;
  let utf8Score = 0;

  for (let i = 0; i < buffer.length - 1; i++) {
    const b = buffer[i];
    const next = buffer[i + 1];

    // Check for Shift_JIS double-byte sequence
    if (
      ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xef)) &&
      ((next >= 0x40 && next <= 0x7e) || (next >= 0x80 && next <= 0xfc))
    ) {
      sjisScore++;
    }

    // Check for valid UTF-8 multi-byte sequences (2-byte: 110xxxxx 10xxxxxx)
    if (b >= 0xc2 && b <= 0xdf && next >= 0x80 && next <= 0xbf) {
      utf8Score++;
    }

    // 3-byte UTF-8: 1110xxxx 10xxxxxx 10xxxxxx
    if (
      b >= 0xe0 &&
      b <= 0xef &&
      next >= 0x80 &&
      next <= 0xbf &&
      i + 2 < buffer.length &&
      buffer[i + 2] >= 0x80 &&
      buffer[i + 2] <= 0xbf
    ) {
      utf8Score += 2;
    }
  }

  // If there are high-byte sequences and Shift_JIS scores higher, assume Shift_JIS
  if (sjisScore > 0 && sjisScore > utf8Score) {
    return "Shift_JIS";
  }

  return "utf-8";
}

/**
 * Convert a buffer to a UTF-8 string, detecting Shift_JIS encoding if needed.
 */
function decodeBuffer(buffer: Buffer): string {
  const encoding = detectEncoding(buffer);

  if (encoding === "Shift_JIS") {
    return iconv.decode(buffer, "Shift_JIS");
  }

  // Strip UTF-8 BOM if present
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf-8");
  }

  return buffer.toString("utf-8");
}

/**
 * Parse a CSV buffer into validated, deduplicated CsvRow[] entries.
 *
 * Steps:
 *  1. Detect encoding (UTF-8 or Shift_JIS) and decode to string
 *  2. Parse CSV using csv-parse
 *  3. Validate each row against csvRowSchema (zod)
 *  4. Deduplicate by normalized company name
 */
export async function parseCSV(buffer: Buffer): Promise<CsvRow[]> {
  const csvString = decodeBuffer(buffer);

  // Parse CSV with headers
  const records: Record<string, string>[] = parse(csvString, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relaxColumnCount: true,
  });

  // Validate each row and collect valid entries
  const validRows: CsvRow[] = [];
  const errors: Array<{ row: number; issues: string[] }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const result = csvRowSchema.safeParse(record);

    if (result.success) {
      validRows.push(result.data);
    } else {
      errors.push({
        row: i + 1,
        issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
    }
  }

  if (errors.length > 0) {
    console.warn(
      `CSV parsing: ${errors.length} row(s) had validation issues and were skipped:`,
      errors.slice(0, 5),
    );
  }

  // Deduplicate by normalized company name (keep the first occurrence)
  const deduplicated = deduplicateBy(validRows, (row) =>
    normalizeCompanyName(row.company_name),
  );

  return deduplicated;
}
