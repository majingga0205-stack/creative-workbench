import { ModulePlaceholder } from '../ModulePlaceholder';

export default function BossModule() {
  return (
    <ModulePlaceholder
      info={{
        title: '보스 페이즈 설계 보드',
        stage: '7·8단계',
        summary:
          '보스 전투를 페이즈 카드로 설계하고, 패턴 타이밍으로 압박도를 계산해 의도한 긴장도와 겹쳐 보고, 2D 미리보기로 실제로 피할 수 있는지 확인합니다.',
        uses: ['캐릭터(보스 주인)', '보스·페이즈·패턴'],
      }}
    />
  );
}
