import assert from "node:assert/strict";
import test from "node:test";
import { CsvCodec, CsvCodecError, escapeFormula } from "../dist/index.js";

const codec = new CsvCodec([
  { key: "id", header: "record_id", required: true, serialize: (value) => value.id, parse: String },
  { key: "title", header: "display_title", required: true, serialize: (value) => value.title, parse: String },
  { key: "rank", header: "rank", serialize: (value) => String(value.rank), parse: (value) => Number(value) },
  { key: "details", header: "details", serialize: (value) => value.details, parse: String },
]);

test("caller-defined exact columns round-trip Unicode, quotes, commas, and multiline values", () => {
  const records = [
    { id: "一", title: 'Café, "서울"', rank: 1, details: "first line\nsecond line" },
    { id: "دو", title: "مرحبا 👋", rank: 2, details: "plain" },
  ];
  const csv = codec.encode(records);
  assert.match(csv, /"Café, ""서울"""/u);
  assert.match(csv, /"first line\nsecond line"/u);
  assert.deepEqual(codec.decode(csv), records);
});

test("formula-like values are escaped on export and restored as literal text on import", () => {
  const values = ["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "  =trimmed", "\n=multiline"];
  for (const value of values) assert.equal(escapeFormula(value), `'${value}`);
  const csv = codec.encode([{ id: "x", title: "=HYPERLINK(\"bad\")", rank: 1, details: "+1" }]);
  assert.match(csv, /'=HYPERLINK/u);
  assert.deepEqual(codec.decode(csv), [{ id: "x", title: "=HYPERLINK(\"bad\")", rank: 1, details: "+1" }]);
});

test("external formula input remains data and exact headers are enforced", () => {
  const raw = "record_id,display_title,rank,details\r\nx,=1+1,1,@name\r\n";
  assert.deepEqual(codec.decode(raw), [{ id: "x", title: "=1+1", rank: 1, details: "@name" }]);
  assert.throws(() => codec.decode("display_title,record_id,rank,details\r\na,b,1,c\r\n"), CsvCodecError);
  assert.throws(() => codec.encode([{ id: "", title: "missing", rank: 1, details: "" }]), CsvCodecError);
});
