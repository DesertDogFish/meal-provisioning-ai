/**
 * «Готово» на экранной клавиатуре = закрыть клавиатуру (владелец 07.11.2026).
 *
 * В Android WebView нажатие Enter в числовом поле подтверждает значение, но
 * НЕ снимает фокус — клавиатура оставалась открытой и перекрывала форму.
 * Здесь один общий обработчик: Enter в поле числа (type=number, inputmode=decimal
 * или enterkeyhint=done) снимает фокус, что и закрывает клавиатуру.
 *
 * Обработчик НЕ мешает вводу: значение уже ушло в onChange/onBlur раньше.
 * Ставится один раз на приложение (App.tsx), перехват — в фазе capture,
 * чтобы отработать раньше обработчиков полей, но без preventDefault.
 */
export function installEnterBlur(): () => void {
  const isNumericField = (el: Element): el is HTMLInputElement => {
    if (!(el instanceof HTMLInputElement)) return false;
    const inputMode = el.getAttribute('inputmode');
    const hint = el.getAttribute('enterkeyhint');
    return el.type === 'number' || inputMode === 'decimal' || inputMode === 'numeric' || hint === 'done';
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const target = e.target as Element | null;
    if (!target || !isNumericField(target)) return;
    // Не мешаем submit формы: просто снимаем фокус (клавиатура закрывается)
    target.blur();
  };

  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}
