export type IdentifiedRecord = { id: string }

export function hasUniqueIds(records: IdentifiedRecord[]): boolean {
  return new Set(records.map(({ id }) => id)).size === records.length
}
