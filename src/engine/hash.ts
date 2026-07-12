/** FNV-1a 32-bit: stable, dependency-free, deterministic across engines
 * (only integer ops and Math.imul). One source for the fixture canary and
 * the online state checkpoints; if this ever changed shape, both would
 * notice at once. */
export function fnv(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
