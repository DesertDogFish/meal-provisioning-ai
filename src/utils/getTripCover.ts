/**
 * Обложки для походов: подбираем картинку Unsplash Source по ключевым словам названия.
 * Море -> sea, горы -> mountains, лес -> forest, иначе -> camping.
 */

const KEYWORD_RULES: Array<{ pattern: RegExp; keyword: string }> = [
  // море / вода
  { pattern: /мор[ея]|море|sea|океан|ocean|берег|пляж|beach|остров|island|яхт|yacht|парус|залив|фьорд|fjord|озер|lake|water/i, keyword: 'sea' },
  // горы
  { pattern: /гор[аыы]|гора|mountain|альп|alps|эльбрус|пик |вершин|хребет|кавказ|алтай|урал|каньон|canyon/i, keyword: 'mountains' },
  // лес
  { pattern: /лес|forest|тайга|карел|taiga|woods|рощ/i, keyword: 'forest' },
];

const FALLBACK_KEYWORD = 'camping';

export function getTripCoverKeyword(tripName: string): string {
  const name = (tripName ?? '').trim();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(name)) return rule.keyword;
  }
  return FALLBACK_KEYWORD;
}

/**
 * Возвращает URL картинки-обложки для похода по его названию.
 */
export function getTripCover(tripName: string): string {
  const keyword = getTripCoverKeyword(tripName);
  return `https://source.unsplash.com/800x400/?${keyword}`;
}

export default getTripCover;
