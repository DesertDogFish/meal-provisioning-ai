// Component-тесты TripForm (PLAN.md Фаза 10, P0 п.2)
// Покрывают: спаренные даты (CR-3 автоподтягивание/min/max), humanize единиц, валидацию и submit.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { TripForm } from './TripForm';
import type { TripFormData } from './TripForm';
import { humanize } from '../utils/calc';

beforeEach(() => cleanup());

const fillName = (name: string) =>
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: name } });

const setStart = (d: string) =>
  fireEvent.change(screen.getByLabelText('Дата начала'), { target: { value: d } });

const setEnd = (d: string) =>
  fireEvent.change(screen.getByLabelText('Дата окончания'), { target: { value: d } });

describe('TripForm — базовый рендер', () => {
  it('показывает заголовок, поля и значения по умолчанию (4 человека)', () => {
    render(<TripForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Новый поход')).toBeTruthy();
    expect(screen.getByLabelText('Название')).toBeTruthy();
    expect(screen.getByLabelText('Количество человек')).toHaveValue(4);
    expect(screen.getByRole('button', { name: 'Создать' })).toBeTruthy();
  });
});

describe('TripForm — даты (CR-3 спаренные дейт-пикеры)', () => {
  it('endDate заблокирован, пока не выбрана дата начала', () => {
    render(<TripForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Дата окончания')).toBeDisabled();
    setStart('2026-07-01');
    expect(screen.getByLabelText('Дата окончания')).toBeEnabled();
  });

  it('endDate не может быть раньше startDate: min у второго пикера = startDate', () => {
    render(<TripForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    setStart('2026-07-10');
    expect(screen.getByLabelText('Дата окончания')).toHaveAttribute('min', '2026-07-10');
  });

  it('сдвиг startDate вперёд за endDate автоматически подтягивает endDate', () => {
    render(<TripForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    setStart('2026-07-01');
    setEnd('2026-07-05');
    setStart('2026-07-20'); // старт обогнал финиш
    expect(screen.getByLabelText('Дата окончания')).toHaveValue('2026-07-20');
  });
});

describe('TripForm — валидация при submit', () => {
  it('пустая форма → ошибки name/startDate/endDate, onSubmit не вызван', async () => {
    const onSubmit = vi.fn();
    render(<TripForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('name');
    expect(alert.textContent).toContain('startDate');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('endDate раньше startDate → ошибка на поле endDate', async () => {
    const onSubmit = vi.fn();
    render(<TripForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fillName('Алтай');
    setStart('2026-08-10');
    setEnd('2026-08-05'); // вручную тащим назад (happy-dom не блокирует min жёстко)
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/endDate must be on or after startDate/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ошибки чистятся после правки поля', async () => {
    render(<TripForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    await screen.findByRole('alert');
    fillName('Таёжный');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('externalErrors отображаются, когда внутренних ошибок нет', () => {
    render(
      <TripForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        externalErrors={[{ field: 'name', message: 'Поход с таким названием уже существует' }]}
      />
    );
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
    render(<TripForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fillName(validData.name);
    // Сначала финиш, потом старт: DateRange на маунте синхронизирует пустой endDate со startDate,
    // поэтому endDate ставим до выбора startDate (иначе controlled-value перезапишет его).
    setEnd(validData.endDate);
    setStart(validData.startDate);
    fireEvent.change(screen.getByLabelText('Количество человек'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Заметки'), { target: { value: 'Север' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ ...validData });
  });

  it('defaultPeople <= 0 не проходит валидацию (positive)', async () => {
    const onSubmit = vi.fn();
    render(<TripForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fillName('Хибин');
    setStart('2026-09-01');
    fireEvent.change(screen.getByLabelText('Количество человек'), { target: { value: '-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('defaultPeople');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('кнопка «Отмена» вызывает onCancel', () => {
    const onCancel = vi.fn();
    render(<TripForm onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('humanize единиц (CR-2) — интеграция, используемая формой/строками', () => {
  it('форматирует кг/г, л/мл, шт, уп', () => {
    expect(humanize(0.8, 'KG')).toBe('800 г');
    expect(humanize(1.5, 'KG')).toBe('1.50 кг');
    expect(humanize(0.25, 'L')).toBe('250 мл');
    expect(humanize(2, 'PCS')).toBe('2 шт');
    expect(humanize(3, 'PACK')).toBe('3 уп');
  });
});
