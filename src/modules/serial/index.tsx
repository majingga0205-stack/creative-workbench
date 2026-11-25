import { ModulePlaceholder } from '../ModulePlaceholder';

export default function SerialModule() {
  return (
    <ModulePlaceholder
      info={{
        title: '연재 실험실',
        stage: '3단계',
        summary:
          '회차 원고의 리듬을 자동으로 재고, 직접 입력한 독자 지표와 나란히 놓아 가설을 검증합니다. 같은 회차의 버전끼리 비교할 수도 있습니다.',
        uses: ['회차 원고(모든 버전)', '독자 지표', '가설'],
      }}
    />
  );
}
