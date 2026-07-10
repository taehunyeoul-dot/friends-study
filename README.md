# Friends 영어공부

프렌즈 시즌 1~10 대본으로 영어 표현을 공부하는 프로젝트.
에피소드 대본 리더 + 간격반복(SRS) 플래시카드 PWA 앱.

## 폴더 구조

```
friends-study/
├─ data/
│  ├─ raw/         시즌별 대본 텍스트 (.doc에서 변환)
│  ├─ episodes/    에피소드별 구조화 JSON (227개) + manifest.json
│  └─ vocab/       에피소드별 핵심 표현 25개 JSON (Claude로 추출)
├─ scripts/
│  ├─ parse_scripts.py    대본 텍스트 → 에피소드 JSON 파싱
│  ├─ extract_prompt.md   표현 추출 기준 프롬프트
│  ├─ extract.ps1         headless claude -p 배치 추출
│  ├─ verify_vocab.py     추출된 대사가 원문에 실재하는지 검증
│  └─ build_app_data.py   data → app/data 복사 + index.json 생성
└─ app/            PWA 앱 (아이폰 홈 화면 설치용)
```

## 자주 쓰는 명령

```powershell
cd E:\team_1\100_이태훈\0_claude\2_영어공부\friends-study

# 표현 추출 (이미 된 에피소드는 자동 스킵, 끊겨도 재실행하면 이어짐)
powershell -ExecutionPolicy Bypass -File scripts\extract.ps1 -Limit 10   # 10개만
powershell -ExecutionPolicy Bypass -File scripts\extract.ps1             # 전체

# 추출 검증 (WARN이 나오면 해당 표현만 눈으로 확인)
python scripts\verify_vocab.py

# 앱 데이터 갱신 (추출 후 실행해야 앱에 반영됨)
python scripts\build_app_data.py

# 로컬에서 앱 실행 → 브라우저에서 http://localhost:8765
python -m http.server 8765 --directory app
```

## 아이폰 설치

앱을 HTTPS 주소로 배포한 뒤(GitHub Pages 등), 아이폰 Safari로 접속 →
공유 버튼 → **홈 화면에 추가**. 이후 일반 앱처럼 실행되고,
시즌 1 데이터는 자동으로 오프라인 저장된다.

학습 기록(카드, 진도)은 기기 안(localStorage)에만 저장된다.
설정 → 내보내기/가져오기로 기기 간 이동 가능.

## 참고 사항

- 추출 모델은 sonnet (haiku는 표현 수 미달로 부적합 판정, 2026-07 기준)
- 에피소드당 비용 ~$0.42 상당 (Pro/Max 구독이면 사용량 한도 차감)
- `extract.ps1`은 UTF-8 BOM 필수 (PowerShell 5.1이 BOM 없으면 ANSI로 읽어 한글 깨짐)
- 원본 대본의 알려진 오타: 시즌9의 909가 "908"로 표기됨 (파서가 자동 보정),
  시즌4의 423은 일반판+무삭제판 중복 (무삭제판 채택)
