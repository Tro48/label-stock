import { useEffect, useRef } from 'react';
import { normalizeBarcode } from '@label-stock/shared';
import { DEFAULT_SCANNER_CONFIG, type ScannerConfig } from './config';
import { keyToLatinChar } from './key-code';

/** Поле с этим атрибутом принимает сканы, остальные поля ввода глобальный перехват не трогает. */
export const SCANNER_TARGET_ATTRIBUTE = 'data-scanner-target';

interface UseBarcodeScannerOptions extends Partial<ScannerConfig> {
  onScan: (barcode: string) => void;
  /** false — перехват выключен целиком, например пока открыто модальное окно. */
  enabled?: boolean;
  now?: () => number;
}

function isForeignEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.hasAttribute(SCANNER_TARGET_ATTRIBUTE)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Сканер-клавиатура вводит символы быстрее человека и завершает Enter. Хук слушает keydown
 * на document и распознаёт скан по скорости ввода, даже если фокус не в строке поиска.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxIntervalMs = DEFAULT_SCANNER_CONFIG.maxIntervalMs,
  minLength = DEFAULT_SCANNER_CONFIG.minLength,
  now = () => performance.now(),
}: UseBarcodeScannerOptions): void {
  const onScanRef = useRef(onScan);
  const nowRef = useRef(now);
  useEffect(() => {
    onScanRef.current = onScan;
    nowRef.current = now;
  });

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let lastKeyAt = 0;
    let resetTimer: number | undefined;

    const reset = () => {
      buffer = '';
      window.clearTimeout(resetTimer);
      resetTimer = undefined;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || isForeignEditable(event.target)) {
        reset();
        return;
      }
      const timestamp = nowRef.current();
      const withinInterval = timestamp - lastKeyAt <= maxIntervalMs;
      lastKeyAt = timestamp;

      if (event.key === 'Enter') {
        const code = normalizeBarcode(buffer);
        const isScan = withinInterval && code.length >= minLength;
        reset();
        if (!isScan) return;
        // Enter сканера не должен нажать кнопку в фокусе или отправить форму поиска.
        event.preventDefault();
        event.stopPropagation();
        onScanRef.current(code);
        return;
      }

      const char = keyToLatinChar(event);
      if (char === null) return;
      buffer = withinInterval ? buffer + char : char;
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(reset, maxIntervalMs * 4);
    };

    // capture: перехватываем Enter раньше обработчиков формы поиска.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      reset();
    };
  }, [enabled, maxIntervalMs, minLength]);
}
