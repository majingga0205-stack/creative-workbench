// 확인 창과 알림 메시지
import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { Button } from './ui';

type ConfirmOpts = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type DialogState = {
  current?: ConfirmOpts & { resolve: (ok: boolean) => void };
  toasts: { id: number; text: string; tone: 'info' | 'error' }[];
};

const useDialogStore = create<DialogState>()(() => ({ toasts: [] }));

/** 확인 창을 띄우고 사용자가 고른 결과를 돌려준다 */
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().current?.resolve(false);
    useDialogStore.setState({ current: { ...opts, resolve } });
  });
}

let toastSeq = 0;
export function toast(text: string, tone: 'info' | 'error' = 'info') {
  const id = ++toastSeq;
  useDialogStore.setState((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
  setTimeout(() => useDialogStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 8000 : 4000);
}

export function DialogHost() {
  const current = useDialogStore((s) => s.current);
  const toasts = useDialogStore((s) => s.toasts);
  const okRef = useRef<HTMLButtonElement>(null);

  const close = (ok: boolean) => {
    current?.resolve(ok);
    useDialogStore.setState({ current: undefined });
  };

  useEffect(() => {
    if (!current) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <>
      {current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onMouseDown={() => close(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-base font-semibold">
              {current.title}
            </h2>
            {current.message && <div className="mt-2 text-sm leading-relaxed text-stone-600">{current.message}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => close(false)}>{current.cancelLabel ?? '취소'}</Button>
              <Button ref={okRef} variant={current.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {current.confirmLabel ?? '확인'}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-sm rounded-md px-4 py-2.5 text-sm shadow-lg ${
              t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-stone-800 text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

/** 작은 모달 (입력 양식용) */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
