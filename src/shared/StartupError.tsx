// 브라우저 저장소(IndexedDB)를 열지 못했을 때 빈 화면 대신 보여 준다
export function StartupError({ error }: { error: unknown }) {
  const e = error as { name?: string; message?: string } | undefined;
  const versionTooNew = e?.name === 'VersionError';
  return (
    <div className="mx-auto max-w-xl p-8 text-sm leading-relaxed" role="alert">
      <h1 className="text-lg font-semibold">창작 작업대를 열 수 없어요</h1>
      {versionTooNew ? (
        <p className="mt-3">이 브라우저에 더 새 버전 앱이 만든 데이터가 있어요. 최신 버전으로 열어 주세요. 데이터는 그대로 있어요.</p>
      ) : (
        <>
          <p className="mt-3">원고를 저장하는 브라우저 저장소(IndexedDB)를 쓸 수 없어요.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
            <li>시크릿(사생활 보호) 창이면 일반 창에서 열어 주세요.</li>
            <li>브라우저 설정에서 사이트 데이터 저장을 막아 두었는지 확인해 주세요.</li>
            <li>디스크 공간이 모자라지 않은지 확인해 주세요.</li>
          </ul>
        </>
      )}
      <p className="mt-4 text-xs text-stone-500">
        오류: {e?.name ?? '알 수 없음'} {e?.message ?? ''}
      </p>
    </div>
  );
}
