import { canonicalJson, encodeUtf8 } from "./canonical-json.js";

export interface Checksum {
  readonly algorithm: string;
  digest(data: Uint8Array): Promise<string>;
}

export class Sha256Checksum implements Checksum {
  readonly algorithm = "sha256";

  constructor(private readonly crypto: Pick<Crypto, "subtle"> = globalThis.crypto) {
    if (!crypto?.subtle) throw new Error("Web Crypto is unavailable");
  }

  async digest(data: Uint8Array): Promise<string> {
    const input = new Uint8Array(data).buffer;
    const digest = await this.crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

export async function checksumJson(value: unknown, checksum: Checksum): Promise<string> {
  return `${checksum.algorithm}:${await checksum.digest(encodeUtf8(canonicalJson(value)))}`;
}

export function checksumsEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
