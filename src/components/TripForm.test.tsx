// Component-тесты TripForm (PLAN.md Фаза 10, P0 п.2)
// Покрывают: спаренные даты (CR-3 автоподтягивание/min/disabled), humanize единиц,
// валидацию и submit.
//
// Даты вводятся через DatePicker (обёртка над react-datepicker с customInput —
// нативным <input type="date">). Особенности взаимодействия:
//  - Целимся в input по id ('#start-date' / '#end-date'), который ставит DateRange;
//    label связан через htmlFor, но у обоих пикеров одинаковый aria-label, поэтому
//    getByLabelText ненадёжен — используем document.querySelector (модалка
//    рендерится через createPortal в body, вне контейнера render()).
//  - Значение input — ISO YYYY-MM-DD; fireEvent.change попадает в наш NativeInput
//    (React-обработчик + колбэк onDateChange), т.е.onChange -> DateRange -> state формы.
//  - Атрибут min присутствует на input как побочный эффект проброса minDate, но
//    контракт CR-3 проверяем функционально (валидация при submit), а не атрибутом.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { TripForm } from './TripForm';
import type { TripFormData } from './TripForm';
import { humanize } from '../utils/calc';

beforeEach(() => cleanup());

/** Рендер формы; возвращаем helpers, привязанные к контейнеру конкретного рендера. */
function renderTripForm(props?: Partial<React.ComponentProps<typeof TripForm>>) {
  const utils = render(
    <TripForm onSubmit={vi.fn()} onCancel={vi.fn()} {...props} />
  );
  const dateInput = (id: 'start-date' | 'end-date') => {
    // FIX: TripForm рендерится через <Modal> (createPortal в document.body),
    // поэтому контейнер render() не содержит модалку — ищем по document.
    const el = document.querySelector<HTMLInputElement>(`input#${id}`);
    if (!el) throw new Error(`DatePicker input #${id} not found`);
    return el;
  };
  return {
    ...utils,
    startInput: () => dateInput('start-date'),
    endInput: () => dateInput('end-date'),
    /** Ввод даты в нативный input внутри DatePicker (ISO YYYY-MM-DD или '' для очистки). */
    setStartDate: (d: string) => {
      fireEvent.change(dateInput('start-date'), { target: { value: d } });
    },
    setEndDate: (d: string) => {
      fireEvent.change(dateInput('end-date'), { target: { value: d } });
    },
  };
}

const fillName = (name: string) =>
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: name } });

describe('TripForm — базовый рендер', () => {
  it('показывает заголовок, поля DatePicker и значения по умолчанию (4 человека)', () => {
    const { startInput, endInput } = renderTripForm();
    expect(screen.getByText('Новый поход')).toBeTruthy();
    expect(screen.getByLabelText('Название')).toBeTruthy();
    // ФАЗА 13: пикеры отрисованы как input[type=text] (браузерный нативный
    // пикер подавлен, единственный календарь — попапер react-datepicker)
    // с классом DatePicker.
    expect(startInput().type).toBe('text');
    expect(startInput().className).toContain('date-picker-input');
    expect(endInput().className).toContain('date-picker-input');
    expect(screen.getByLabelText('Количество человек')).toHaveValue(4);
    expect(screen.getByRole('button', { name: 'Создать' })).toBeTruthy();
  });
});

describe('TripForm — даты (CR-3 спаренные дейт-пикеры)', () => {
  it('endDate заблокирован, пока не выбрана дата начала; разблокируется после выбора', async () => {
    const { startInput, endInput, setStartDate } = renderTripForm();
    // До выбора startDate: disabled + визуальный класс .disabled на input
    expect(endInput()).toBeDisabled();
    expect(endInput().className).toContain('disabled');
    expect(startInput()).toBeEnabled();

    setStartDate('2026-07-01');

    await waitFor(() => expect(endInput()).toBeEnabled());
    expect(endInput().className).not.toContain('disabled');
    // Автоподтягивание CR-3: пустой endDate заполняется значением startDate
    expect(endInput()).toHaveValue('2026-07-01');
  });

  it('min второго пикера синхронизируется со startDate (через minDate проп react-datepicker)', async () => {
    const { endInput, setStartDate } = renderTripForm();
    expect(endInput()).not.toHaveAttribute('min');

    setStartDate('2026-07-10');

    await waitFor(() => expect(endInput()).toHaveAttribute('min', '2026-07-10'));
  });

  it('сдвиг startDate вперёд за endDate автоматически подтягивает endDate', async () => {
    const { startInput, endInput, setStartDate, setEndDate } = renderTripForm();
    setStartDate('2026-07-01');
    await waitFor(() => expect(endInput()).toBeEnabled());
    setEndDate('2026-07-05');
    await waitFor(() => expect(endInput()).toHaveValue('2026-07-05'));

    setStartDate('2026-07-20'); // старт обогнал финиш

    await waitFor(() => expect(endInput()).toHaveValue('2026-07-20'));
    expect(startInput()).toHaveValue('2026-07-20');
  });
});

describe('TripForm — валидация при submit', () => {
  it('пустая форма → ошибки name/startDate/endDate, onSubmit не вызван', async () => {
    const onSubmit = vi.fn();
    renderTripForm({ onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('name');
    expect(alert.textContent).toContain('startDate');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('endDate раньше startDate → ошибка «endDate must be on or after startDate»', async () => {
    const onSubmit = vi.fn();
    const { endInput, setStartDate, setEndDate } = renderTripForm({ onSubmit });
    fillName('Алтай');
    setStartDate('2026-08-10');
    await waitFor(() => expect(endInput()).toBeEnabled());
    // Ручной ввод дублирует выбор из календаря: minDate ограничивает попап,
    // но нативный input пропускает значение дальше — до валидатора формы (CR-3).
    setEndDate('2026-08-05');
    await waitFor(() => expect(endInput()).toHaveValue('2026-08-05'));

    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/endDate must be on or after startDate/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ошибки чистятся после правки поля', async () => {
    renderTripForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    await screen.findByRole('alert');
    fillName('Таёжный');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('externalErrors отображаются, когда внутренних ошибок нет', () => {
    renderTripForm({
      externalErrors: [{ field: 'name', message: 'Поход с таким названием уже существует' }],
    });
    expect(screen.getByRole('alert').textContent).toContain('уже существует');
  });
});

describe('TripForm — успешный submit с humanize-корректными данными', () => {
  const validData: TripFormData = {
    name: 'Кольский',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    defaultPeople: 6,
    notes: 'Север',
  };

  it('полная валидная форма → onSubmit получает данные формы', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { endInput, setStartDate, setEndDate } = renderTripForm({ onSubmit });
    fillName(validData.name);
    setStartDate(validData.startDate);
    // Ждём каскадных обновлений DateRange (разблокировка + автоподтягивание endDate)
    await waitFor(() => expect(endInput()).toHaveValue(validData.startDate));
    setEndDate(validData.endDate);
    await waitFor(() => expect(endInput()).toHaveValue(validData.endDate));

    fireEvent.change(screen.getByLabelText('Количество человек'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Заметки'), { target: { value: 'Север' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ ...validData });
  });

  it('defaultPeople <= 0 не проходит валидацию (positive)', async () => {
    const onSubmit = vi.fn();
    const { endInput, setStartDate } = renderTripForm({ onSubmit });
    fillName('Хибин');
    setStartDate('2026-09-01');
    await waitFor(() => expect(endInput()).toHaveValue('2026-09-01'));
    fireEvent.change(screen.getByLabelText('Количество человек'), { target: { value: '-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('defaultPeople');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('кнопка «Отмена» вызывает onCancel', () => {
    const onCancel = vi.fn();
    renderTripForm({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('U21: крестик в шапке вызывает onCancel (единый способ закрытия модалок)', () => {
    const onCancel = vi.fn();
    renderTripForm({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('humanize единиц (CR-2) — интеграция, используемая формой/строками', () => {
  it('форматирует кг/г, л/мл, шт, уп', () => {
    expect(humanize(0.8, 'KG')).toBe('800 г');
    expect(humanize(1.5, 'KG')).toBe('1,5 кг'); // Release-1.0: единый формат — запятая
    expect(humanize(0.25, 'L')).toBe('250 мл');
    expect(humanize(2, 'PCS')).toBe('2 шт');
    expect(humanize(3, 'PACK')).toBe('3 уп');
  });
});

// ---------- U36 (список 26.10): режим редактирования похода ----------

describe('TripForm — edit-режим (U36)', () => {
  it('initial заполняет поля; заголовок и кнопка — редактирование', () => {
    const { startInput, endInput } = renderTripForm({
      title: 'Редактирование похода',
      submitLabel: 'Сохранить',
      initial: {
        name: 'Поход на Алтай',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        defaultPeople: 6,
        notes: 'старая строка',
      },
    });
    expect(screen.getByText('Редактирование похода')).toBeTruthy();
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Поход на Алтай');
    expect((screen.getByLabelText('Количество человек') as HTMLInputElement).value).toBe('6');
    expect((screen.getByLabelText('Заметки') as HTMLInputElement).value).toBe('старая строка');
    expect(startInput().value).toBe('2026-07-01');
    expect(endInput().value).toBe('2026-07-05');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeTruthy();
  });

  it('submit отправляет изменённые значения (включая новые даты — для предупреждения родителем)', async () => {
    const onSubmit = vi.fn();
    const { setStartDate, setEndDate } = renderTripForm({
      submitLabel: 'Сохранить',
      initial: { name: 'Поход', startDate: '2026-07-01', endDate: '2026-07-05', defaultPeople: 4, notes: '' },
      onSubmit,
    });
    setStartDate('2026-08-01');
    setEndDate('2026-08-03');
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Поход v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const data: TripFormData = onSubmit.mock.calls[0][0];
    expect(data.name).toBe('Поход v2');
    expect(data.startDate).toBe('2026-08-01');
    expect(data.endDate).toBe('2026-08-03');
  });
});

// Fix-8 (п.1/2): «почему кнопка создать без обводки и цвета» + «текст не по центру».
// Кнопки подвала — компоненты Button дизайн-системы: «Создать» — primary
// (фирменный градиент/обводка из Button.module.css), «Отмена» — ghost;
// .btn центрирует содержимое (justify-content + text-align), в т.ч. при flex-1.
describe('TripForm — кнопки подвала (Fix-8 п.1/2)', () => {
  it('«Создать» — primary-кнопка дизайн-системы, «Отмена» — ghost (не «голые» <button> без стиля)', () => {
    renderTripForm();
    const submit = screen.getByRole('button', { name: 'Создать' });
    const cancel = screen.getByRole('button', { name: 'Отмена' });
    // классы CSS-модулей: базовый .btn + вариант
    expect(submit.className).toContain('btn');
    expect(submit.className).toContain('primary');
    expect(cancel.className).toContain('btn');
    expect(cancel.className).toContain('ghost');
    // никаких пустых инлайн-стилей (старый баг: style={{ opacity … }} без фона/рамки)
    expect(submit.style.background).toBe('');
    expect(submit.getAttribute('style') ?? '').not.toContain('opacity');
  });
});
