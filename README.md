# 강남구/서초구 음식점 지도 애플리케이션

강남구와 서초구 주변의 음식점들을 지도 상에 표시하고 정보를 확인할 수 있는 웹 애플리케이션입니다.

## 기능

- 지도 상에 음식점 위치 표시
- 줌 레벨에 따른 레스토랑 정보 최적화 표시
- 음식점 상세 정보 확인 (별점, 리뷰, 주소, 거리 등)
- Google Maps 링크

## 기술 스택

- Next.js
- TypeScript
- Google Maps API
- Tailwind CSS

## 시작하기

### 사전 요구사항

- Node.js 18 이상
- Google Maps API 키

### 설치

1. 저장소 복제
```bash
git clone <repository-url>
cd restaurant-map
```

2. 의존성 설치
```bash
npm install
```

3. 환경 변수 설정
```bash
cp .env.sample .env.local
```
`.env.local` 파일을 열고 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`에 본인의 Google Maps API 키를 입력하세요.

### 개발 서버 실행

```bash
npm run dev
```

이후 브라우저에서 [http://localhost:3000](http://localhost:3000)에 접속하면 애플리케이션을 확인할 수 있습니다.

## API 키 보안

이 프로젝트는 Google Maps API를 사용합니다. API 키는 보안을 위해 `.env.local` 파일에 보관하며, 
이 파일은 `.gitignore`에 의해 Git 저장소에 포함되지 않습니다.

## 배포

애플리케이션을 배포할 때는 배포 환경에서도 환경 변수를 설정해야 합니다.

## 라이센스

이 프로젝트는 MIT 라이센스를 따릅니다. 