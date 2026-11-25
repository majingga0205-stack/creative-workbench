// 신화 DB 시드 (SPEC 모듈 D '시드 데이터' 표의 구미호·도깨비·산군만, 전부 verified: false, 출처는 비워 둔다).
// 널리 알려진 특징만 적은 예시다. 국립민속박물관 『한국민속대백과사전』 등에서 확인한 뒤 출처를 채운다.
// 이 목록 밖의 존재·요소·출처를 더하지 않는다. keywords는 요소 이름에 들어 있는 낱말만 쓰고, opposite는 비워 둔다.
import type { ArchetypeElement, Being } from '../db/types';

const T = '2026-11-25T00:00:00.000Z';

const el = (id: string, label: string, weight: ArchetypeElement['weight'], category: ArchetypeElement['category'], keywords: string[]): ArchetypeElement => ({
  id,
  label,
  category,
  weight,
  keywords,
  opposite: [],
  sources: [],
  verified: false,
});

export const MYTH_SEED: Being[] = [
  {
    id: 'seed-gumiho',
    name: '구미호',
    aliases: [],
    summary: '',
    elements: [
      el('gumiho-tails', '꼬리 아홉 달린 여우', 'core', '외형', ['꼬리', '여우']),
      el('gumiho-shapeshift', '사람·주로 여인으로 둔갑', 'core', '능력', ['둔갑']),
      el('gumiho-liver', '사람의 간이나 정기를 노림', 'common', '서사 기능', ['간', '정기']),
      el('gumiho-bead', '여우 구슬', 'common', '능력', ['여우 구슬', '구슬']),
    ],
    traps: [],
    updatedAt: T,
  },
  {
    id: 'seed-dokkaebi',
    name: '도깨비',
    aliases: [],
    summary: '',
    elements: [
      el('dokkaebi-object', '사람 손때 묻은 낡은 물건이 변함', 'common', '서사 기능', ['손때', '낡은 물건']),
      el('dokkaebi-club', '요술 방망이', 'common', '능력', ['요술 방망이', '방망이']),
      el('dokkaebi-wrestling', '씨름·내기를 좋아함', 'common', '성격', ['씨름', '내기']),
      el('dokkaebi-fire', '도깨비불', 'common', '능력', ['도깨비불']),
      el('dokkaebi-buckwheat', '메밀묵을 좋아함', 'variant', '성격', ['메밀묵']),
    ],
    traps: [
      {
        id: 'dokkaebi-oni',
        claim: '뿔이 나고 호랑이 가죽을 두르고 쇠몽둥이를 든 모습이 한국 도깨비의 모습이다',
        correction: '뿔이 나고 호랑이 가죽을 두르고 쇠몽둥이를 든 모습은 일본 오니 이미지의 영향이라는 지적이 많다. 요술 방망이 자체는 한국 설화에도 나온다.',
        triggerWords: ['뿔', '호피', '쇠몽둥이'],
        sources: [],
        verified: false,
      },
    ],
    updatedAt: T,
  },
  {
    id: 'seed-sangun',
    name: '산군(호랑이)',
    aliases: ['산군', '호랑이'],
    summary: '',
    elements: [
      el('sangun-mountain-god', '산신 또는 산신의 사자로 모셔짐', 'core', '서사 기능', ['산신']),
      el('sangun-painting', '산신도에 산신과 함께 그려짐', 'common', '출현 장소', ['산신도']),
    ],
    traps: [],
    updatedAt: T,
  },
];
