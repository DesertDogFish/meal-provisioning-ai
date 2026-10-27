import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

/**
 * Fix-7 (п.9): плавающая кнопка «наверх».
 * Маленькая (36px), полупрозрачная, в правом нижнем углу; плавно появляется,
 * когда страница промотана так, что шапка уже не видна (scrollY > threshold),
 * и плавно прячется у верха. Клик — мягкий скролл наверх.
 *
 * Скролл-контейнер приложения — окно (main растягивается по контенту),
 * поэтому слушаем window.scroll. Кнопка не перехватывает клики, пока скрыта
 * (pointer-events:none в CSS .scroll-top-btn без .visible).
 */
export default function ScrollTopButton({ threshold = 200 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [threshold]);

  return (
    <button
      type="button"
      className={`scroll-top-btn ${visible ? 'visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Вернуться наверх страницы"
      title="Наверх"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      data-testid="scroll-top"
    >
      <ChevronUp size={18} aria-hidden />
    </button>
  );
}
