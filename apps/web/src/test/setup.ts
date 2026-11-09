import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom не реализует модальный <dialog>: эмулируем атрибут open, чтобы проверять поведение компонентов.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom не вычисляет isContentEditable: считаем по ближайшему атрибуту contenteditable, как браузер.
if (typeof document.createElement('div').isContentEditable !== 'boolean') {
  Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
    configurable: true,
    get(this: HTMLElement) {
      const host = this.closest('[contenteditable]');
      return host !== null && host.getAttribute('contenteditable') !== 'false';
    },
  });
}

afterEach(() => {
  cleanup();
  // Подменённый fetch и фейковые таймеры не должны протекать в соседние тесты.
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
