import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCANNER_TARGET_ATTRIBUTE, useBarcodeScanner } from './useBarcodeScanner';

const MAX_INTERVAL_MS = 35;
const MIN_LENGTH = 6;
const FAST_STEP_MS = 10;
const SLOW_STEP_MS = 50;
const EAN = '4600000000017';

/** Ручные часы: интервалы между нажатиями задаются явно, без фейковых таймеров. */
function createClock(start = 1_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

type Clock = ReturnType<typeof createClock>;

function codeFor(char: string): string {
  if (/\d/.test(char)) return `Digit${char}`;
  if (/[a-z]/i.test(char)) return `Key${char.toUpperCase()}`;
  return '';
}

/** Нажатие: возвращает false, если обработчик вызвал preventDefault. */
function press(target: Element | Document, init: KeyboardEventInit): boolean {
  return fireEvent.keyDown(target, init);
}

function typeText(target: Element | Document, text: string, clock: Clock, stepMs = FAST_STEP_MS) {
  for (const char of text) {
    clock.advance(stepMs);
    press(target, { key: char, code: codeFor(char) });
  }
}

function pressEnter(target: Element | Document, clock: Clock, stepMs = FAST_STEP_MS): boolean {
  clock.advance(stepMs);
  return press(target, { key: 'Enter', code: 'Enter' });
}

function setup(options: { enabled?: boolean; minLength?: number; maxIntervalMs?: number } = {}) {
  const clock = createClock();
  const onScan = vi.fn();
  const hook = renderHook(
    (props: { enabled?: boolean; onScan: (code: string) => void }) =>
      useBarcodeScanner({
        maxIntervalMs: MAX_INTERVAL_MS,
        minLength: MIN_LENGTH,
        ...options,
        ...props,
        now: clock.now,
      }),
    { initialProps: { onScan, enabled: options.enabled ?? true } },
  );
  return { clock, onScan, hook };
}

let extraElements: HTMLElement[] = [];

function attach<Element extends HTMLElement>(element: Element): Element {
  document.body.append(element);
  extraElements.push(element);
  return element;
}

beforeEach(() => {
  extraElements = [];
});

afterEach(() => {
  for (const element of extraElements) element.remove();
});

describe('useBarcodeScanner: распознавание скана', () => {
  it('быстрый ввод и Enter — скан с кодом', () => {
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(EAN);
  });

  it('пауза ровно maxIntervalMs ещё считается сканом', () => {
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock, MAX_INTERVAL_MS);
    pressEnter(document.body, clock, MAX_INTERVAL_MS);
    expect(onScan).toHaveBeenCalledWith(EAN);
  });

  it('медленный ввод — не скан', () => {
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock, SLOW_STEP_MS);
    pressEnter(document.body, clock, SLOW_STEP_MS);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('пауза на один интервал больше порога разрывает буфер: в скан идут только символы после паузы', () => {
    const { clock, onScan } = setup();
    typeText(document.body, '999', clock);
    clock.advance(MAX_INTERVAL_MS + 1);
    typeText(document.body, EAN, clock);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith(EAN);
  });

  it('быстрые символы, но пауза перед Enter — не скан', () => {
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock);
    const notPrevented = pressEnter(document.body, clock, MAX_INTERVAL_MS + 1);
    expect(onScan).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it(`ровно ${MIN_LENGTH} символов — скан, ${MIN_LENGTH - 1} — нет`, () => {
    const { clock, onScan } = setup();
    typeText(document.body, '12345', clock);
    pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();

    clock.advance(1_000);
    typeText(document.body, '123456', clock);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith('123456');
  });

  it('Enter без символов — не скан', () => {
    const { clock, onScan } = setup();
    pressEnter(document.body, clock);
    pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('буфер очищается после скана: второй скан не склеивается с первым', () => {
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock);
    pressEnter(document.body, clock);
    typeText(document.body, '123456', clock);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenNthCalledWith(2, '123456');
  });

  it('учитывает свои minLength и maxIntervalMs', () => {
    const { clock, onScan } = setup({ minLength: 3, maxIntervalMs: 100 });
    typeText(document.body, '123', clock, 90);
    pressEnter(document.body, clock, 90);
    expect(onScan).toHaveBeenCalledWith('123');
  });

  it('вызывает актуальный onScan после перерендера', () => {
    const { clock, onScan, hook } = setup();
    const nextOnScan = vi.fn();
    hook.rerender({ onScan: nextOnScan, enabled: true });
    typeText(document.body, EAN, clock);
    pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();
    expect(nextOnScan).toHaveBeenCalledWith(EAN);
  });
});

describe('useBarcodeScanner: раскладка и регистр', () => {
  it('русская раскладка: key кириллица, символы берутся по code', () => {
    const { clock, onScan } = setup();
    // Сканер «печатает» ABC123, а при русской раскладке key приходит как «фис».
    for (const [key, code] of [
      ['ф', 'KeyA'],
      ['и', 'KeyB'],
      ['с', 'KeyC'],
      ['1', 'Digit1'],
      ['2', 'Digit2'],
      ['3', 'Digit3'],
    ] as const) {
      clock.advance(FAST_STEP_MS);
      press(document.body, { key, code });
    }
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith('abc123');
  });

  it('Shift и CapsLock дают заглавные буквы', () => {
    const { clock, onScan } = setup();
    clock.advance(FAST_STEP_MS);
    press(document.body, { key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    clock.advance(FAST_STEP_MS);
    press(document.body, { key: 'Ф', code: 'KeyA', shiftKey: true });
    clock.advance(FAST_STEP_MS);
    press(document.body, { key: 'И', code: 'KeyB', modifierCapsLock: true } as KeyboardEventInit);
    typeText(document.body, '1234', clock);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith('AB1234');
  });

  it('ASCII из key берётся с регистром: латинская раскладка не искажается', () => {
    const { clock, onScan } = setup();
    typeText(document.body, 'AbC123', clock);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith('AbC123');
  });

  it('цифры с Numpad', () => {
    const { clock, onScan } = setup();
    for (const digit of '460123') {
      clock.advance(FAST_STEP_MS);
      press(document.body, { key: digit, code: `Numpad${digit}` });
    }
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith('460123');
  });

  it('неизвестный code: кириллица из key нормализуется в латиницу', () => {
    const { clock, onScan } = setup();
    for (const key of 'фис123') {
      clock.advance(FAST_STEP_MS);
      press(document.body, { key, code: '' });
    }
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith('abc123');
  });
});

describe('useBarcodeScanner: поля ввода', () => {
  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
  ])('ввод в постороннее поле %s игнорируется', (_name, create) => {
    const { clock, onScan } = setup();
    const field = attach(create());
    typeText(field, EAN, clock);
    const notPrevented = pressEnter(field, clock);
    expect(onScan).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it('ввод в contentEditable игнорируется', () => {
    const { clock, onScan } = setup();
    const editable = attach(document.createElement('div'));
    editable.setAttribute('contenteditable', 'true');
    typeText(editable, EAN, clock);
    pressEnter(editable, clock);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('символы в постороннем поле сбрасывают уже набранный буфер', () => {
    const { clock, onScan } = setup();
    const field = attach(document.createElement('input'));
    typeText(document.body, '123', clock);
    typeText(field, 'x', clock);
    typeText(document.body, '456', clock);
    pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();
  });

  it(`поле с ${SCANNER_TARGET_ATTRIBUTE} принимает скан`, () => {
    const { clock, onScan } = setup();
    const search = attach(document.createElement('input'));
    search.setAttribute(SCANNER_TARGET_ATTRIBUTE, '');
    typeText(search, EAN, clock);
    const notPrevented = pressEnter(search, clock);
    expect(onScan).toHaveBeenCalledWith(EAN);
    expect(notPrevented).toBe(false);
  });

  it('обычный ввод в поле со сканом не перехватывает Enter', () => {
    const { clock, onScan } = setup();
    const search = attach(document.createElement('input'));
    search.setAttribute(SCANNER_TARGET_ATTRIBUTE, '');
    typeText(search, 'ромашка', clock, SLOW_STEP_MS);
    const notPrevented = pressEnter(search, clock, SLOW_STEP_MS);
    expect(onScan).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });
});

describe('useBarcodeScanner: Enter и кнопка в фокусе', () => {
  function renderFocusedButton() {
    const onClick = vi.fn();
    const { getByRole } = render(
      <button type="button" onClick={onClick}>
        Изменить остаток
      </button>,
    );
    getByRole('button').focus();
    return onClick;
  }

  it('Enter скана делает preventDefault: кнопка в фокусе не нажимается', async () => {
    let time = 1_000;
    const onScan = vi.fn();
    renderHook(() =>
      useBarcodeScanner({
        onScan,
        maxIntervalMs: MAX_INTERVAL_MS,
        minLength: MIN_LENGTH,
        now: () => (time += FAST_STEP_MS),
      }),
    );
    const onClick = renderFocusedButton();
    const user = userEvent.setup({ delay: null });
    await user.keyboard(`${EAN}{Enter}`);
    expect(onScan).toHaveBeenCalledWith(EAN);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('обычный Enter (человек) нажимает кнопку', async () => {
    let time = 1_000;
    const onScan = vi.fn();
    renderHook(() =>
      useBarcodeScanner({
        onScan,
        maxIntervalMs: MAX_INTERVAL_MS,
        minLength: MIN_LENGTH,
        now: () => (time += SLOW_STEP_MS),
      }),
    );
    const onClick = renderFocusedButton();
    const user = userEvent.setup({ delay: null });
    await user.keyboard(`${EAN}{Enter}`);
    expect(onScan).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Enter скана не доходит до обработчиков на элементе', () => {
    const { clock, onScan } = setup();
    const form = attach(document.createElement('form'));
    const onKeyDown = vi.fn();
    form.addEventListener('keydown', onKeyDown);
    typeText(form, EAN, clock);
    onKeyDown.mockClear();
    pressEnter(form, clock);
    expect(onScan).toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

describe('useBarcodeScanner: модификаторы', () => {
  it.each([['ctrlKey'], ['altKey'], ['metaKey']])('%s сбрасывает буфер', (modifier) => {
    const { clock, onScan } = setup();
    typeText(document.body, '1234', clock);
    clock.advance(FAST_STEP_MS);
    press(document.body, { key: 'v', code: 'KeyV', [modifier]: true });
    typeText(document.body, '56', clock);
    pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('Enter с модификатором — не скан и не перехватывается', () => {
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock);
    clock.advance(FAST_STEP_MS);
    const notPrevented = press(document.body, { key: 'Enter', code: 'Enter', ctrlKey: true });
    expect(onScan).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });
});

describe('useBarcodeScanner: жизненный цикл', () => {
  it('enabled=false — не слушает', () => {
    const { clock, onScan } = setup({ enabled: false });
    typeText(document.body, EAN, clock);
    const notPrevented = pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it('включение после enabled=false начинает слушать', () => {
    const { clock, onScan, hook } = setup({ enabled: false });
    hook.rerender({ onScan, enabled: true });
    typeText(document.body, EAN, clock);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith(EAN);
  });

  it('выключение посреди скана сбрасывает буфер', () => {
    const { clock, onScan, hook } = setup();
    typeText(document.body, '460000', clock);
    hook.rerender({ onScan, enabled: false });
    hook.rerender({ onScan, enabled: true });
    typeText(document.body, '0017', clock);
    pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('размонтирование снимает слушатель', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { clock, onScan, hook } = setup();
    hook.unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    typeText(document.body, EAN, clock);
    pressEnter(document.body, clock);
    expect(onScan).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });

  it('размонтирование очищает таймер сброса', () => {
    vi.useFakeTimers();
    const { clock, hook } = setup();
    typeText(document.body, '123', clock);
    expect(vi.getTimerCount()).toBe(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('буфер сбрасывается по таймеру', () => {
    vi.useFakeTimers();
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock);
    vi.advanceTimersByTime(MAX_INTERVAL_MS * 4);
    // Часы хука не двигаем: интервал до Enter формально короткий, но буфер уже пуст.
    clock.advance(1);
    press(document.body, { key: 'Enter', code: 'Enter' });
    expect(onScan).not.toHaveBeenCalled();
  });

  it('до срабатывания таймера буфер жив', () => {
    vi.useFakeTimers();
    const { clock, onScan } = setup();
    typeText(document.body, EAN, clock);
    vi.advanceTimersByTime(MAX_INTERVAL_MS * 4 - 1);
    pressEnter(document.body, clock);
    expect(onScan).toHaveBeenCalledWith(EAN);
  });

  it('держит не больше одного таймера сброса', () => {
    vi.useFakeTimers();
    const { clock } = setup();
    typeText(document.body, EAN, clock);
    expect(vi.getTimerCount()).toBe(1);
  });
});
