export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export class CanonicalJsonError extends TypeError {}

export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();

  const visit = (current: unknown, path: string): string => {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new CanonicalJsonError(`Non-finite number at ${path}`);
      }
      return JSON.stringify(Object.is(current, -0) ? 0 : current);
    }
    if (typeof current !== "object") {
      throw new CanonicalJsonError(`Unsupported value at ${path}`);
    }
    if (ancestors.has(current)) {
      throw new CanonicalJsonError(`Circular value at ${path}`);
    }

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        return `[${current.map((item, index) => visit(item, `${path}[${index}]`)).join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current) as object | null;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new CanonicalJsonError(`Non-plain object at ${path}`);
      }
      const record = current as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${visit(record[key], `${path}.${key}`)}`)
        .join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  };

  return visit(value, "$root");
}

export function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}
