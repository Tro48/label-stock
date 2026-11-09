import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from './like';

describe('escapeLikePattern', () => {
  it.each([
    ['обычный текст', 'Ромашка', 'Ромашка'],
    ['пустая строка', '', ''],
    ['процент', '100%', '100\\%'],
    ['подчёркивание', 'a_b', 'a\\_b'],
    ['обратный слэш', 'a\\b', 'a\\\\b'],
    ['все спецсимволы подряд', '%_\\', '\\%\\_\\\\'],
    ['повторы', '%%', '\\%\\%'],
    ['кавычки не трогает: запрос параметризован', '\'"', '\'"'],
  ])('%s', (_name, input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });
});
