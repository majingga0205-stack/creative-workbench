import { useSession } from '../store/ui';

/** SPEC: 시작할 때 navigator.storage.persist()를 요청한다 */
export async function requestPersist(): Promise<void> {
  const set = useSession.getState().setPersistStatus;
  if (!navigator.storage?.persist) {
    set('unsupported');
    return;
  }
  try {
    if (await navigator.storage.persisted()) {
      set('granted');
      return;
    }
    set((await navigator.storage.persist()) ? 'granted' : 'denied');
  } catch {
    set('denied');
  }
}
