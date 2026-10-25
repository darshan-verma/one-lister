/**
 * Escape `%`, `_`, and `\` so they are treated as literals in ILIKE patterns.
 * Pair with `ESCAPE '\'` in the SQL.
 */
export function escapeIlikePattern(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
