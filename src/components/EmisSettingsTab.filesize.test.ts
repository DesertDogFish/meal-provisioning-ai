/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 10):
 * размер файла в чипе выбранного файла печатался через `toFixed()` — «1.5 МБ».
 * В ru-локали десятичный разделитель всегда запятая.
 */
/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { formatFileSize } from './EmisSettingsTab';

describe('formatFileSize — ru-формат размера (UX-осмотр 31.10, п.10)', () => {
  it('мегабайты: десятичная запятая', () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1,5 МБ');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2,0 МБ');
  });

  it('килобайты и байты — целыми', () => {
    expect(formatFileSize(2048)).toBe('2 КБ');
    expect(formatFileSize(512)).toBe('512 Б');
  });
});
