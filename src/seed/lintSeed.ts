// 고증 DB 시드 (SPEC 모듈 A '시드 데이터' 표의 5개만, 전부 verified: false).
// 통설을 적은 예시다. 사용자가 출처 원문을 직접 확인한 뒤 고친다. 이 목록 밖의 항목이나 출처를 더하지 않는다.
// 시기는 '세기 초 = 01~20년, 전반 = 01~50년' 규칙으로 숫자로 바꿨다.
import type { LintEntry } from '../db/types';

const T = '2026-11-25T00:00:00.000Z';

export const LINT_SEED: LintEntry[] = [
  {
    id: 'seed-potato',
    term: '감자',
    aliases: [],
    matchMode: 'word',
    exclude: [],
    category: '음식',
    kind: 'not_yet',
    region: '한반도',
    appears: { from: 1801, to: 1850, precision: '시기' }, // 19세기 전반
    sources: [
      { title: '오주연문장전산고', author: '이규경', locator: '만주 경유 기록', type: '1차 사료' },
      { title: '1832년 로드 애머스트호 전래설', type: '기타' },
    ],
    disputed: true,
    disputeNote: '들어온 경로와 연도에 이설이 있음',
    verified: false,
    updatedAt: T,
  },
  {
    id: 'seed-sweet-potato',
    term: '고구마',
    aliases: [],
    matchMode: 'word',
    exclude: [],
    category: '음식',
    kind: 'not_yet',
    region: '한반도',
    appears: { from: 1763, to: 1764, precision: '연도' },
    sources: [{ title: '해사일기', author: '조엄', locator: '통신사 사행 중 쓰시마에서 종자를 들여온 기록', type: '1차 사료' }],
    disputed: false,
    verified: false,
    updatedAt: T,
  },
  {
    id: 'seed-chili',
    term: '고추',
    aliases: [],
    matchMode: 'word',
    exclude: [],
    category: '음식',
    kind: 'not_yet',
    region: '한반도',
    appears: { from: 1601, to: 1620, precision: '시기' }, // 17세기 초 문헌 기록
    sources: [{ title: '지봉유설', author: '이수광', year: '1614', locator: '‘남만초’ 기록', type: '1차 사료' }],
    disputed: true,
    disputeNote: '전래 시기와 경로에 이설이 있음',
    verified: false,
    updatedAt: T,
  },
  {
    id: 'seed-tobacco',
    term: '담배',
    aliases: [],
    matchMode: 'word',
    exclude: [],
    category: '물건',
    kind: 'not_yet',
    region: '한반도',
    appears: { from: 1601, to: 1620, precision: '시기' }, // 17세기 초
    sources: [{ title: '지봉유설', author: '이수광', year: '1614', locator: '담배 관련 기록', type: '1차 사료' }],
    disputed: false,
    verified: false,
    updatedAt: T,
  },
  {
    id: 'seed-economy',
    term: '경제',
    aliases: [],
    matchMode: 'word',
    exclude: ['경제육전'],
    category: '단어',
    kind: 'meaning_shift',
    region: '한반도',
    senses: [
      { label: '조선: 세상을 다스리고 백성을 구제함', contextWords: [] },
      { label: '근대 이후: economy', contextWords: ['돈', '시장', '물가', '불황'] },
    ],
    sources: [
      { title: '경제육전', year: '1397', locator: '조선 전기 용례', type: '1차 사료' },
      { title: '근대 번역어 연구', type: '연구서·논문' },
    ],
    disputed: false,
    verified: false,
    updatedAt: T,
  },
];
