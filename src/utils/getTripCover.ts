/**
 * Обложки для походов: ключевые слова названия → локальная SVG-обложка.
 * Море -> sea, горы -> mountains, лес -> forest, иначе -> camping.
 *
 * FIX (список багов 25.10, «картинки для походов не грузятся»):
 * раньше URL строился на внешнем сервисе loremflickr.com — он недоступен/нестабилен,
 * а `?random=${Date.now()}` пересоздавал URL на каждый рендер (бесконечная
 * перезагрузка картинки). Теперь обложки — детерминированные локальные ассеты
 * из src/assets/covers/: грузятся всегда (включая демо-режим без сети) и не
 * меняются между рендерами.
 */
import coverSea from '../assets/covers/sea.svg';
import coverMountains from '../assets/covers/mountains.svg';
import coverForest from '../assets/covers/forest.svg';
import coverCamping from '../assets/covers/camping.svg';

const KEYWORD_RULES: Array<{ pattern: RegExp; keyword: string }> = [
  // море / вода
  { pattern: /мор[ея]|море|sea|океан|ocean|берег|пляж|beach|остров|island|яхт|yacht|парус|залив|фьорд|fjord|озер|lake|water/i, keyword: 'sea' },
  // горы
  { pattern: /гор[аыы]|гора|mountain|альп|alps|эльбрус|пик |вершин|хребет|кавказ|алтай|урал|каньон|canyon/i, keyword: 'mountains' },
  // лес
  { pattern: /лес|forest|тайга|карел|taiga|woods|рощ/i, keyword: 'forest' },
];

const FALLBACK_KEYWORD = 'camping';

const COVERS: Record<string, string> = {
  sea: coverSea,
  mountains: coverMountains,
  forest: coverForest,
  camping: coverCamping,
};

export function getTripCoverKeyword(tripName: string): string {
  const name = (tripName ?? '').trim();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(name)) return rule.keyword;
  }
  return FALLBACK_KEYWORD;
}

/**
 * Возвращает URL картинки-обложки для похода по его названию.
 * Детерминированно: одинаковое название → одинаковый URL (без Date.now()).
 */
export function getTripCover(tripName: string): string {
  const keyword = getTripCoverKeyword(tripName);
  return COVERS[keyword] ?? COVERS[FALLBACK_KEYWORD];
}

export default getTripCover;
