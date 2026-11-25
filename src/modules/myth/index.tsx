import { ModulePlaceholder } from '../ModulePlaceholder';

export default function MythModule() {
  return (
    <ModulePlaceholder
      info={{
        title: '신화 원형 아카이브',
        stage: '6단계',
        summary:
          '신화·설화 존재마다 원형 요소를 체크리스트로 쌓고, 내 캐릭터를 대조해 가져온 것·바꾼 것·버린 핵심·충돌을 보여줍니다.',
        uses: ['캐릭터(특성·연결된 원형)', '신화 DB(공용)'],
      }}
    />
  );
}
