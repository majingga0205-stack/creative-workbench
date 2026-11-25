import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'invalid';

/** SPEC: 입력 후 0.5초 뒤 자동 저장 */
export const AUTOSAVE_DELAY_MS = 500;

/**
 * value가 바뀌면 delay 뒤에 save(value)를 부른다.
 * - 마지막으로 저장한 값과 같으면 저장하지 않는다 (updatedAt이 괜히 바뀌지 않도록).
 * - valid가 false면 저장하지 않고 'invalid' 상태가 된다.
 * - 화면을 떠나거나 창을 닫을 때 남은 저장을 바로 실행한다.
 * save는 value만 보고 어디에 저장할지 알 수 있어야 한다 (value 안에 id를 넣을 것).
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<unknown> | unknown,
  opts: { valid?: boolean; delay?: number } = {},
): { status: AutosaveStatus; flush: () => Promise<void> } {
  const { valid = true, delay = AUTOSAVE_DELAY_MS } = opts;
  const [status, setStatus] = useState<AutosaveStatus>('saved');
  const saveRef = useRef(save);
  saveRef.current = save;
  const lastSaved = useRef(JSON.stringify(value));
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setStatus('saving');
    try {
      await saveRef.current(p.value);
      lastSaved.current = JSON.stringify(p.value);
      setStatus(pending.current ? 'pending' : 'saved');
    } catch (e) {
      console.error('자동 저장 실패', e);
      setStatus('error');
    }
  }, []);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!valid) {
      clearTimeout(timer.current);
      pending.current = null;
      setStatus('invalid');
      return;
    }
    if (serialized === lastSaved.current) {
      if (!pending.current) setStatus((s) => (s === 'invalid' || s === 'pending' ? 'saved' : s));
      return;
    }
    pending.current = { value };
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
    // value는 serialized로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, valid, delay, flush]);

  useEffect(() => {
    const onUnload = () => void flush();
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
      void flush();
    };
  }, [flush]);

  return { status, flush };
}
