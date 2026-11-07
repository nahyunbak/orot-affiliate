export type MergeMode = "merge" | "replace";

export interface MergePreview {
  readonly mode: MergeMode;
  readonly localCount: number;
  readonly incomingCount: number;
  readonly conflictIds: readonly string[];
  readonly addCount: number;
  readonly preserveCount: number;
  readonly removeCount: number;
}

export interface PreviewPort<T> {
  preview(local: readonly T[], incoming: readonly T[], mode: MergeMode): MergePreview;
}

export interface MergeResult<T> {
  readonly records: readonly T[];
  readonly idMap: ReadonlyMap<string, string>;
  readonly preview: MergePreview;
}

export interface MergePort<T> extends PreviewPort<T> {
  merge(local: readonly T[], incoming: readonly T[], mode: MergeMode): MergeResult<T>;
}

export type RelationshipRemapper<T> = (
  incoming: readonly T[],
  completeIdMap: ReadonlyMap<string, string>,
) => readonly T[];

export interface RecordMergerOptions<T> {
  readonly idOf: (record: T) => string;
  readonly createId: (incomingId: string, occupiedIds: ReadonlySet<string>) => string;
  readonly remapRelationships: RelationshipRemapper<T>;
}

export class DuplicateIdError extends Error {}

export class RecordMerger<T> implements MergePort<T> {
  constructor(private readonly options: RecordMergerOptions<T>) {}

  preview(local: readonly T[], incoming: readonly T[], mode: MergeMode): MergePreview {
    const localIds = uniqueIds(local, this.options.idOf, "local");
    const incomingIds = uniqueIds(incoming, this.options.idOf, "incoming");
    const conflicts = [...incomingIds].filter((id) => localIds.has(id)).sort();
    return {
      mode,
      localCount: local.length,
      incomingCount: incoming.length,
      conflictIds: conflicts,
      addCount: incoming.length,
      preserveCount: mode === "merge" ? local.length : 0,
      removeCount: mode === "replace" ? local.length : 0,
    };
  }

  merge(local: readonly T[], incoming: readonly T[], mode: MergeMode): MergeResult<T> {
    const preview = this.preview(local, incoming, mode);
    const occupied = new Set(mode === "merge" ? local.map(this.options.idOf) : []);
    const idMap = new Map<string, string>();

    for (const record of incoming) {
      const originalId = this.options.idOf(record);
      let nextId = originalId;
      if (occupied.has(nextId)) nextId = this.options.createId(originalId, occupied);
      if (!nextId || occupied.has(nextId)) throw new DuplicateIdError(`ID generator returned occupied ID: ${nextId}`);
      idMap.set(originalId, nextId);
      occupied.add(nextId);
    }

    const rewritten = this.options.remapRelationships(incoming, idMap);
    if (rewritten.length !== incoming.length) throw new Error("Relationship remapper changed record count");
    const rewrittenIds = uniqueIds(rewritten, this.options.idOf, "remapped");
    for (const mappedId of idMap.values()) {
      if (!rewrittenIds.has(mappedId)) throw new Error(`Relationship remapper did not apply ID ${mappedId}`);
    }
    return {
      records: mode === "merge" ? [...local, ...rewritten] : [...rewritten],
      idMap,
      preview,
    };
  }
}

function uniqueIds<T>(records: readonly T[], idOf: (record: T) => string, label: string): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    const id = idOf(record);
    if (!id) throw new DuplicateIdError(`Empty ID in ${label} records`);
    if (ids.has(id)) throw new DuplicateIdError(`Duplicate ID in ${label} records: ${id}`);
    ids.add(id);
  }
  return ids;
}
