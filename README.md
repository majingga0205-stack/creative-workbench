# 창작 작업대

혼자 쓰는 로컬 창작 도구. 시대 고증 린터 · 인물 네트워크 · 연재 실험실 · 신화 원형 아카이브 · 보스 페이즈 설계 보드를 작품 단위로 묶는다. 서버·AI·외부 API 없이 브라우저 안(IndexedDB)에만 저장한다.

- 기능 명세: [docs/SPEC.md](docs/SPEC.md)
- 진행 상황: [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md)
- 작업 규칙(클로드 코드용): [CLAUDE.md](CLAUDE.md)

## 실행

Node.js 20 이상이 필요하다.

```bash
npm install
npm run dev      # 개발 서버 → 브라우저에서 http://localhost:5173
npm test         # 단위 테스트
npm run build    # 빌드 확인
```

## 데이터

- 원고와 설정은 실행한 브라우저의 IndexedDB에 저장된다. 브라우저 데이터를 지우면 사라지므로 **설정 · 백업 → 전체 내보내기**로 JSON 파일을 자주 저장해 둔다.
- 다른 컴퓨터로 옮길 때: 전체 내보내기 → 다른 컴퓨터에서 **불러오기**.
