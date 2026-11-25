import { Component, type ReactNode } from 'react';

/** 한 화면에서 오류가 나도 앱 전체가 하얗게 멈추지 않게 한다 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('화면 오류', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
        <p className="font-semibold">이 화면에서 오류가 났어요.</p>
        <p className="mt-1">저장된 데이터는 그대로예요. 다른 메뉴로 옮기거나 다시 시도해 보세요.</p>
        <pre className="mt-3 overflow-auto rounded bg-white/70 p-2 text-xs">{String(this.state.error.message || this.state.error)}</pre>
        <button type="button" className="mt-3 underline" onClick={() => this.setState({ error: null })}>
          다시 시도
        </button>
      </div>
    );
  }
}
