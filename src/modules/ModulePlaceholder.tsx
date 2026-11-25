import { Badge, PageHeader } from '../shared/ui';

export type ModuleInfo = {
  title: string;
  stage: string;
  summary: string;
  uses: string[];
};

/** 아직 만들지 않은 모듈 자리 (1단계) */
export function ModulePlaceholder({ info }: { info: ModuleInfo }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={info.title} right={<Badge tone="amber">{info.stage}에서 구현</Badge>} />
      <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-6 text-sm leading-relaxed text-stone-600">
        <p>{info.summary}</p>
        <p className="mt-4 text-[13px] text-stone-500">함께 쓰는 데이터: {info.uses.join(' · ')}</p>
      </div>
    </div>
  );
}
