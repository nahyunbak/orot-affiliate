export interface CsvColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly required?: boolean;
  serialize(value: T): string;
  parse(value: string): unknown;
}

export class CsvCodecError extends Error {
  constructor(message: string, readonly row?: number, readonly column?: string) {
    super(message);
  }
}

export class CsvCodec<T extends Record<string, unknown>> {
  constructor(private readonly columns: readonly CsvColumn<T>[]) {
    if (columns.length === 0) throw new CsvCodecError("At least one CSV column is required");
    const keys = new Set<string>();
    const headers = new Set<string>();
    for (const column of columns) {
      if (!column.key || !column.header) throw new CsvCodecError("CSV column keys and headers must be nonempty");
      if (keys.has(column.key) || headers.has(column.header)) throw new CsvCodecError("CSV columns must be unique");
      keys.add(column.key);
      headers.add(column.header);
    }
  }

  encode(records: readonly T[]): string {
    const rows = [this.columns.map((column) => quoteCsv(column.header)).join(",")];
    for (const [index, record] of records.entries()) {
      rows.push(
        this.columns
          .map((column) => {
            const value = column.serialize(record);
            if (column.required && value.length === 0) {
              throw new CsvCodecError("Required CSV value is empty", index + 2, column.header);
            }
            return quoteCsv(escapeFormula(value));
          })
          .join(","),
      );
    }
    return `${rows.join("\r\n")}\r\n`;
  }

  decode(csv: string): T[] {
    const rows = parseCsv(csv);
    if (rows.length === 0) throw new CsvCodecError("CSV is empty");
    const header = rows[0] ?? [];
    const expected = this.columns.map((column) => column.header);
    if (header.length !== expected.length || header.some((value, index) => value !== expected[index])) {
      throw new CsvCodecError(`CSV header must exactly match: ${expected.join(",")}`, 1);
    }

    const records: T[] = [];
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      if (row.length === 1 && row[0] === "" && rowIndex === rows.length - 1) continue;
      if (row.length !== this.columns.length) throw new CsvCodecError("CSV row has the wrong column count", rowIndex + 1);
      const record: Record<string, unknown> = {};
      for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex += 1) {
        const column = this.columns[columnIndex]!;
        const value = unescapeFormula(row[columnIndex]!);
        if (column.required && value.length === 0) {
          throw new CsvCodecError("Required CSV value is empty", rowIndex + 1, column.header);
        }
        try {
          record[column.key] = column.parse(value);
        } catch (error) {
          throw new CsvCodecError(
            `Invalid CSV value: ${error instanceof Error ? error.message : String(error)}`,
            rowIndex + 1,
            column.header,
          );
        }
      }
      records.push(record as T);
    }
    return records;
  }
}

export function escapeFormula(value: string): string {
  return /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
}

export function unescapeFormula(value: string): string {
  return value.startsWith("'") && /^\s*[=+\-@]/u.test(value.slice(1)) ? value.slice(1) : value;
}

function quoteCsv(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsv(input: string): string[][] {
  if (input.startsWith("\uFEFF")) input = input.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length !== 0) throw new CsvCodecError("Unexpected quote in CSV field", rows.length + 1);
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new CsvCodecError("Unclosed quoted CSV field", rows.length + 1);
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
