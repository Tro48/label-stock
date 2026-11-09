export interface ScannerConfig {
  /** Максимальная пауза между символами скана, мс. Человек так быстро не печатает. */
  maxIntervalMs: number;
  /** Минимальная длина кода, чтобы быстрый ввод считался сканом. */
  minLength: number;
}

function positiveIntOr(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Порог подбирается под конкретный сканер при сборке: VITE_SCANNER_MAX_INTERVAL_MS, VITE_SCANNER_MIN_LENGTH.
export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  maxIntervalMs: positiveIntOr(import.meta.env.VITE_SCANNER_MAX_INTERVAL_MS, 35),
  minLength: positiveIntOr(import.meta.env.VITE_SCANNER_MIN_LENGTH, 6),
};
