import { ModulePlaceholder } from '../ModulePlaceholder';

export default function LintModule() {
  return (
    <ModulePlaceholder
      info={{
        title: '시대 고증 린터',
        stage: '4단계',
        summary:
          '작품이나 회차에 시대를 정하고 원고를 검사하면, 아직 없던 것은 빨강, 시점이 경계에 걸리거나 이설이 있는 것은 노랑, 뜻이 바뀐 단어는 파랑으로 원문에 표시합니다.',
        uses: ['작품 시대 설정', '회차 원고(현재 버전)', '고증 DB(공용)'],
      }}
    />
  );
}
