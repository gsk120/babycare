# 이유식 추천 워커 수동 실행

iMac 워커가 Vercel API에서 가족 한 곳의 설정을 읽고 로컬 Chroma를 검색한 뒤 Codex CLI로 추천을 생성한다. 테스트에서는 원본 대조가 끝난 `verified_recipes`만 사용한다.

## 준비

1. 테스트용 웹앱 서버에 `BABYCARE_WORKER_TOKEN`을 설정한다. iMac의 저장소 루트에 아래 값을 가진 `.env.worker`를 만들고 같은 토큰을 넣는다.

   ```dotenv
   BABYCARE_WORKER_URL=http://localhost:3000
   BABYCARE_WORKER_TOKEN=
   # 설치 위치를 기본값과 다르게 사용하면 지정한다.
   # BABYCARE_CODEX_BIN=/absolute/path/to/codex
   # BABYCARE_WORKER_PYTHON=/absolute/path/to/python
   # BABYCARE_CHROMA_DIR=.chroma/babycare-reference
   ```

2. 새 테스트 DB에는 프로젝트의 `sql/schema.sql`과 `sql/add-feature-tables.sql`을 순서대로 적용한다. 기존 DB는 [추천 출처 저장 마이그레이션](./store-recommendation-citations.sql)을 적용한 뒤 새 API를 사용한다. 추천 항목에서 책 제목과 페이지를 저장하고, PDF 목록과 파일은 iMac에서 관리한다. 테스트 가족의 UUID와 사용자 계정에서 저장한 아이 프로필·추천 설정을 준비한다.
3. 프로젝트 루트에서 Node.js 22.14 이상과 Python 3.12를 사용한다. Python 의존성은 테스트한 버전으로 설치한다.

   ```sh
   python3.12 -m venv .chroma/babycare-reference/venv
   .chroma/babycare-reference/venv/bin/python -m pip install -r worker/requirements.txt
   ```

   iMac의 기존 Chroma 디렉터리 아래 `index`와 `model`이 필요하다. Codex CLI는 `BABYCARE_CODEX_BIN`, 프로젝트의 `CODEX_EXECUTABLE` 또는 `CODEX_JS` 설정을 우선 사용한다. 경로 설정이 없으면 macOS ChatGPT 앱에 포함된 CLI나 `PATH`의 `codex`를 사용한다.

## 로컬 웹앱 관리

iMac의 프로젝트 루트에서 실행한다. 로컬 서버용 `.env.local`에도 `.env.worker`와 같은 `BABYCARE_WORKER_TOKEN`을 설정한다.

```sh
./babycare start
./babycare status
./babycare logs
./babycare logs --lines 100 --follow
./babycare restart
./babycare stop
```

`start`는 Next.js 개발 서버를 백그라운드에서 시작한다. 기본 주소는 `http://localhost:3000`이고 로그는 `.babycare/server.log`에 쌓인다. 포트를 바꾸려면 `./babycare start --port 3001`을 실행하고 `.env.worker`의 URL도 맞춘다. `restart`는 실행 중인 서버의 포트를 그대로 사용한다. `logs --follow`는 Ctrl+C로 닫을 수 있다. 각 명령의 사용법은 `./babycare <명령> --help`로 확인한다.

## 추천 실행

```sh
./babycare worker --family-id "여기에-테스트-가족-UUID" --preview
./babycare worker --family-id "여기에-테스트-가족-UUID"
```

`--preview`는 생성과 검증까지 실행하고 추천 JSON을 출력한다. 두 번째 명령은 `.env.worker`에 지정한 웹앱의 API에 추천 결과와 책 제목·페이지를 제출한다. 가족별 추천 지침은 iMac의 `.babycare/family-prompts`에 캐시한다. 테스트 가족으로 웹앱에 로그인해 ‘오늘’ 화면의 메뉴 수, 총 끼 수, PDF 출처를 확인한다. 같은 가족과 추천일에 다시 실행하면 기존 묶음 ID가 반환된다.

수동 실행은 한국 시간 기준 오늘에 대해 동작한다. 가족이 등록한 추천 요일은 자정 예약 단계에서 적용한다.

## 가족별 조리 환경

기존 DB에는 [조리 환경 컬럼 마이그레이션](./add-cooking-environment.sql)을 적용한다. 가족이 웹 설정에서 조리 환경을 저장하면 워커는 다음 추천에서 최신 설정을 읽어 조리법에 반영한다.

## 조리 단계별 이미지

1. 같은 Supabase 프로젝트에 비공개 버킷 `babycare-recipe-images`를 준비하고, SQL Editor에서 [조리 이미지 테이블 마이그레이션](./store-recipe-step-images.sql)을 실행한다.
2. 로컬 웹 서버와 Vercel의 서버 환경 변수에 해당 프로젝트의 Supabase Secret Key를 `BABYCARE_STORAGE_SECRET_KEY`로 설정한다. 로컬 서버의 환경 변수를 바꾼 뒤 `./babycare restart`를 실행한다. 서버는 레시피를 조회할 권한이 있는 가족에게 한 시간 유효한 다운로드 URL을 내준다.
3. 이미지 생성은 iMac에 로그인된 Codex CLI의 내장 이미지 도구를 사용한다. 이미지 작업은 프로젝트의 `CODEX_MODEL`과 `CODEX_TIMEOUT_SECONDS` 설정을 읽는다. 생성한 파일을 WebP로 변환한 뒤 비공개 버킷에 업로드한다.

```sh
./babycare worker --family-id "여기에-테스트-가족-UUID"
./babycare images --family-id "여기에-테스트-가족-UUID"
```

추천 실행은 먼저 레시피를 저장하고 이어서 조리 이미지를 생성한다. 이미 저장한 추천의 이미지를 준비하거나 작업을 재시도하려면 `images` 명령을 쓴다. 이 명령은 가족의 가장 최근 추천을 대상으로 한다. 저장된 단계 이미지는 다시 생성하지 않는다. `--preview` 실행에는 이미지 생성이나 업로드가 포함되지 않는다.

## 이전 PDF 테이블 정리

1. 새 Vercel 버전에서 추천을 저장하고 ‘오늘’ 화면에 책 제목과 페이지가 표시되는지 확인한다.
2. Supabase Storage에서 `babycare-pdfs` 버킷이 남아 있다면 내용물을 확인한 뒤 Storage 화면에서 삭제한다. [Supabase Storage 관리 문서](https://supabase.com/docs/guides/storage/schema/design)
3. 같은 Supabase 프로젝트의 SQL Editor에서 [이전 PDF 구조 제거 SQL](./remove-legacy-pdf-schema.sql)을 실행한다. 기존 추천의 출처가 새 컬럼에 모두 복사됐고 이전 버킷이 제거됐는지 확인한 뒤, 이전 테이블·관리 함수·정책을 삭제한다. Vercel이 사용하는 `babycare_app` 역할은 유지한다.
