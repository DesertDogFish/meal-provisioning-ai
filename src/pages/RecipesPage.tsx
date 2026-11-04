import { useRecipesPage } from './useRecipesPage';
import RecipesPageView from './RecipesPageView';

export default function RecipesPage() {
  const vm = useRecipesPage();
  return <RecipesPageView vm={vm} />;
}
