// 내보내기·불러오기 대상 테이블 목록. Dexie를 import하지 않는다.
// 나중 단계에서 테이블을 더할 때는 여기에 한 줄을 추가하고,
// schema.ts의 RECORD_SCHEMAS와 database.ts의 Dexie 버전을 함께 올린다.

export type ExportScope = 'all' | 'work' | 'lint' | 'myth';

export const SCOPE_LABELS: Record<ExportScope, string> = {
  all: '전체',
  work: '작품 하나',
  lint: '고증 DB만',
  myth: '신화 DB만',
};

export type TableGroup = 'work' | 'lint' | 'myth' | 'settings';

export type TableDef = {
  name: string;
  /** 기본 키 필드 */
  key: string;
  group: TableGroup;
  /** group이 'work'일 때, 어느 작품의 레코드인지 알려주는 필드 */
  workKey?: string;
  label: string;
};

export const TABLE_DEFS: TableDef[] = [
  { name: 'works', key: 'id', group: 'work', workKey: 'id', label: '작품' },
  { name: 'characters', key: 'id', group: 'work', workKey: 'workId', label: '캐릭터' },
  { name: 'chapters', key: 'id', group: 'work', workKey: 'workId', label: '회차' },
  { name: 'readerSnapshots', key: 'id', group: 'work', workKey: 'workId', label: '독자 지표 기록' },
  { name: 'hypotheses', key: 'id', group: 'work', workKey: 'workId', label: '가설' },
  { name: 'glossary', key: 'id', group: 'work', workKey: 'workId', label: 'SF 용어집' },
  { name: 'lintResolutions', key: 'id', group: 'work', workKey: 'workId', label: '고증 처리 기록' },
  { name: 'networkEdits', key: 'id', group: 'work', workKey: 'workId', label: '관계망 수동 보정' },
  { name: 'lintEntries', key: 'id', group: 'lint', label: '고증 항목' },
  { name: 'beings', key: 'id', group: 'myth', label: '신화 존재' },
  { name: 'beingRelations', key: 'id', group: 'myth', label: '존재 관계' },
  { name: 'settings', key: 'key', group: 'settings', label: '설정' },
];

export function tablesForScope(scope: ExportScope, defs: TableDef[] = TABLE_DEFS): TableDef[] {
  switch (scope) {
    case 'all':
      return defs;
    case 'work':
      return defs.filter((d) => d.group === 'work');
    case 'lint':
      return defs.filter((d) => d.group === 'lint');
    case 'myth':
      return defs.filter((d) => d.group === 'myth');
  }
}

/** 레코드를 사람이 알아볼 수 있게 한 줄로 */
export function describeRecord(table: string, rec: Record<string, unknown>): string {
  switch (table) {
    case 'works':
      return `작품 「${String(rec.title ?? '')}」`;
    case 'characters':
      return `캐릭터 ${String(rec.name ?? '')}`;
    case 'chapters':
      return `${String(rec.number ?? '?')}화 ${String(rec.title ?? '')}`.trim();
    case 'settings':
      return `설정 ${String(rec.key ?? '')}`;
    case 'readerSnapshots':
      return `독자 지표 기록 (${String(rec.recordedAt ?? '')}, ${String(rec.daysAfter ?? '?')}일차)`;
    case 'hypotheses':
      return `가설 「${String(rec.statement ?? '')}」`;
    case 'lintEntries':
      return `고증 항목 ‘${String(rec.term ?? '')}’`;
    case 'glossary':
      return `용어 ‘${String(rec.canonical ?? '')}’`;
    case 'beings':
      return `신화 존재 ‘${String(rec.name ?? '')}’`;
    case 'beingRelations':
      return `존재 관계 ‘${String(rec.label ?? '')}’`;
    case 'networkEdits':
      return `관계망 수동 보정 (${String(rec.action ?? '')})`;
    case 'lintResolutions':
      return `고증 처리 기록 (${String(rec.status ?? '')})`;
    default:
      return `${table} ${String(rec.id ?? rec.key ?? '')}`;
  }
}
