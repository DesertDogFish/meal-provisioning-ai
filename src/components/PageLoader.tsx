import preloaderUrl from '../assets/preloader.svg';

/**
 * Fix-10 (п.4/5): брендовая загрузка страниц вместо голой надписи «Загрузка…».
 *
 * Анимация — префлоадер v5 из design-pack (assets/preloader.svg): парус растёт
 * от ватерлинии, снежный пик опускается сверху, отражение дышит (SMIL —
 * анимируется даже через <img>). Долгое время ассет «простаивал» — теперь это
 * единый лоаджер приложения: Suspense-фолбэк ленивых роутов + состояния
 * загрузки страниц + ProtectedRoute.
 *
 * Доступность: role="status" + aria-live="polite" (скринридер объявит один раз),
 * подпись — не чистая декорация, а текст статуса.
 */
export default function PageLoader({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="page-loader" role="status" aria-live="polite" data-testid="page-loader">
      <img
        src={preloaderUrl}
        width={96}
        height={96}
        alt=""
        aria-hidden
        className="page-loader__mark"
        draggable={false}
      />
      <p className="page-loader__text">{label}</p>
    </div>
  );
}

export { PageLoader };
