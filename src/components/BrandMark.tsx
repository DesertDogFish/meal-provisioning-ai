import markDark from '../assets/mark.svg?raw';
import markLight from '../assets/mark-light.svg?raw';

// Знак берётся ТОЛЬКО из design-pack assets/ (не перерисовывается, не перекрашивается).
// На тёмном — mark.svg, на светлом — mark-light.svg; переключение — через data-theme:
// обе версии инлайнятся в DOM, CSS по атрибуту темы показывает нужную
// (компонент сам о теме ничего не знает — правило пакета).
export default function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} role="img" aria-label="Провиант">
      <span className="brand-mark__dark" dangerouslySetInnerHTML={{ __html: markDark }} />
      <span className="brand-mark__light" dangerouslySetInnerHTML={{ __html: markLight }} />
    </span>
  );
}
