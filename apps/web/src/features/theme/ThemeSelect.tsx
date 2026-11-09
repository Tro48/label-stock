import { useId } from 'react';
import { THEME_OPTIONS, useThemePreference, type ThemePreference } from './theme';

export function ThemeSelect() {
  const id = useId();
  const [preference, setPreference] = useThemePreference();

  return (
    <div className="theme-select">
      <label htmlFor={id} className="theme-select__label">
        Тема
      </label>
      <select
        id={id}
        className="input input--compact"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        {THEME_OPTIONS.map(({ value, text }) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
