import { useMealCompositionModal, type Props } from './useMealCompositionModal';
import MealCompositionModalView from './MealCompositionModalView';

export default function MealCompositionModal(props: Props) {
  const vm = useMealCompositionModal(props);
  return <MealCompositionModalView vm={vm} />;
}
