/** Short, stable, URL-safe ids. */
export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}${rand}`;
}
