// Largest value of a Postgres integer column
const MAX_INT = 2_147_483_647;

// Reads the ?group= parameter of the main page. Anything that is not a
// positive integer id means "all groups" and gives null
export function parseGroupParam(
  value: string | string[] | undefined,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    return null;
  }
  const id = Number(raw);
  return id > 0 && id <= MAX_INT ? id : null;
}

// The group chosen by ?group= among the groups of the signed-in user. The id
// of someone else's group, a deleted group and a broken value all give
// undefined, which means "Все группы"
export function findSelectedGroup<T extends { id: number }>(
  groups: T[],
  param: string | string[] | undefined,
): T | undefined {
  const id = parseGroupParam(param);
  return groups.find((group) => group.id === id);
}
