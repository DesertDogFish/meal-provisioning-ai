/**
 * Compatibility shim: реализация переехала в `./format` (Release-1.0, UI-consistency —
 * единые правила вывода чисел). Оставляем ре-экспорт, чтобы не ломать существующие импорты.
 */
export { formatRub } from './format';
