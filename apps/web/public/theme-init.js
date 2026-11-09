// Выполняется до отрисовки: ставит сохранённую тему, чтобы страница не мигала светлой.
// Отдельный файл, а не inline-скрипт: CSP разрешает скрипты только с того же источника.
// Ключ и значения совпадают с src/features/theme/theme.ts.
try {
  const storedTheme = window.localStorage.getItem('label-stock-theme');
  if (storedTheme === 'light' || storedTheme === 'dark') {
    document.documentElement.dataset.theme = storedTheme;
  }
} catch {
  // localStorage недоступен — остаётся системная тема.
}
