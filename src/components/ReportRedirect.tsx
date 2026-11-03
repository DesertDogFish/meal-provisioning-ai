import { Navigate, useParams } from 'react-router-dom';

/**
 * trip-workflow-redesign п.5: отчёт перестал быть одинокой страницей —
 * роут /trips/:id/report сохранён как РЕДИРЕКТ на /trips/:id?stage=ready
 * (этап ⑤ «Поход готов»): шаринг-ссылки и старые закладки не ломаются.
 */
export function ReportRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/trips/${id}?stage=ready`} replace />;
}

export default ReportRedirect;
