import { saveFile } from './download'

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}

/** Build a CSV file and offer it to the viewer. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  // BOM so Excel opens UTF-8 names (e.g. accented characters) correctly.
  void saveFile(filename, '﻿' + toCsv(rows), 'text/csv')
}
