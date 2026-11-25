# 창작 작업대 — 작업 규칙

## 먼저 읽을 것
- docs/SPEC.md — 이번에 작업할 단계의 섹션
- docs/PROJECT_STATE.md — 지금까지 한 일과 알려진 문제, SPEC과 다르게 정한 것

## 절대 규칙
1. 오프라인: 네트워크 요청, LLM·외부 API, 원격 CDN·폰트를 쓰지 않는다. 라이브러리는 npm으로만 설치한다.
2. 데이터 보존: DB 구조를 바꾸면 schemaVersion을 올리고 마이그레이션을 쓴다. 기존 데이터를 지우거나 덮어쓰는 동작은 확인 창 없이 실행하지 않는다.
3. 출처: 고증·신화 데이터의 항목, 연도, 출처를 지어내지 않는다. 시드는 SPEC 표에 있는 것만, 전부 verified: false.
4. 판정·계산은 src/core에 순수 함수로 두고 React·Dexie를 import하지 않는다. core를 바꾸면 테스트도 함께 고친다.
5. 하이라이트는 원문 start/end 위치로 한다. 키워드를 다시 찾아 위치를 추정하지 않는다.
6. 경고에는 항상 '의도함 / 무시' 처리를 둔다.
7. 화면 문구는 한국어.

## 작업 방식
- 시작할 때 바꿀 파일 목록과 순서를 먼저 보여준다.
- SPEC에 없는 기능은 만들지 않는다. 필요해 보이면 제안만 하고 docs/TODO.md에 적는다.
- SPEC과 다르게 구현해야 하면 이유를 docs/PROJECT_STATE.md에 적는다.
- 끝낼 때: npm test와 npm run build 통과를 확인하고 docs/PROJECT_STATE.md(한 일 / 남은 일 / 알려진 문제)를 갱신한다.

## 명령어
- npm run dev — 개발 서버
- npm test — 단위 테스트
- npm run build — 빌드 확인
