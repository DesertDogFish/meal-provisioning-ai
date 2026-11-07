import { Menu } from 'lucide-react';

import { openAppDrawer } from '../ui/drawerBus';
import { HeaderIconButton } from './HeaderIconButton';

/**
 * Кнопка вызова бокового меню для мобильных шапок страниц.
 *
 * UX-список владельца п.13/п.23: верхнее табло Layout с гамбургером убрано, кнопка
 * переехала в шапку страницы — слева от заголовка (и перед кнопкой «назад» на экране
 * похода). Рендерится общим `HeaderIconButton`, чтобы в одной строке с «назад» обе
 * кнопки были одинакового размера.
 */
export function AppMenuButton({ testId = 'app-menu-button' }: { testId?: string }) {
  return (
    <span className="lg:hidden shrink-0 inline-flex">
      <HeaderIconButton label="Открыть меню навигации" onClick={() => openAppDrawer()} testId={testId}>
        <Menu size={20} />
      </HeaderIconButton>
    </span>
  );
}
