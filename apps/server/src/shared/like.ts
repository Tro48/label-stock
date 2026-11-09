/** Экранирует `%`, `_` и `\` для LIKE/ILIKE, чтобы пользовательский ввод искался буквально. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
