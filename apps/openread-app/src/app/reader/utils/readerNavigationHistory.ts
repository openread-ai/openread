import type { FoliateView } from '@/types/view';

export async function navigateReaderToAppliedProgress(
  view: FoliateView,
  location: string,
  isColdRestore: boolean,
): Promise<void> {
  if (isColdRestore) view.history.clear();
  await view.goTo(location);
}
