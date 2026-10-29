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
