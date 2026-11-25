import { ModulePlaceholder } from '../ModulePlaceholder';

export default function NetworkModule() {
  return (
    <ModulePlaceholder
      info={{
        title: '인물 네트워크',
        stage: '5단계',
        summary:
          '회차 원고에서 등록된 캐릭터가 같은 장면에 함께 나온 횟수를 세어 관계망을 그리고, 중심성과 ‘인물 빼기’ 실험으로 이야기 구조를 봅니다.',
        uses: ['캐릭터(이름·별칭)', '회차 원고(현재 버전)'],
      }}
    />
  );
}
