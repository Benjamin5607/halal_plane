# Halal Plane 🕌

무슬림 여행자를 위한 할랄 맛집·기도실 가이드 PWA입니다.  
GPS 기반 추천, AI 가이드 **Amina**, 세계 지도, 여권 스탬프 기능을 제공합니다.

**Live Demo:** https://benjamin5607.github.io/halal_plane/

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 🗺️ **장소 탐색** | Google Sheets DB 기반 할랄 식당·카페·모스크 목록 |
| 🤖 **Amina AI** | Groq LLM 기반 할랄 여행 챗봇 및 장소 리뷰 |
| 📍 **GPS 추천** | 현재 위치 기준 거리 표시 및 근처 장소 추천 |
| 🎫 **여권 스탬프** | 방문한 장소를 로컬 스토리지에 기록 |
| 🌐 **다국어** | 한국어 / English / 日本語 / 中文 지원 |
| 📱 **PWA** | `manifest.json` 기반 모바일 홈 화면 추가 가능 |

---

## 프로젝트 구조

```
halal_plane/
├── index.html          # 메인 UI 및 앱 로직
├── ai_brain.js         # Amina AI (Groq API 연동)
├── manifest.json       # PWA 설정
├── amina.png           # 앱 아이콘 / Amina 버튼
├── bg.png              # 배경 이미지
└── .github/workflows/
    └── deploy.yml      # GitHub Pages 자동 배포
```

---

## 로컬 실행

ES Module을 사용하므로 **로컬 HTTP 서버**가 필요합니다.

```bash
# Python 3
python3 -m http.server 8080

# 또는 Node.js (npx)
npx serve .
```

브라우저에서 `http://localhost:8080` 접속 후, Groq API Key 입력 프롬프트가 뜨면 키를 입력합니다.

> API Key 발급: https://console.groq.com/

---

## GitHub Pages 배포

`main` 브랜치에 push하면 GitHub Actions가 자동으로 Pages에 배포합니다.

### API Key 설정 (Secrets)

Repository → **Settings → Secrets and variables → Actions** 에서:

| Secret 이름 | 값 |
|-------------|-----|
| `GROQ_KEY_PLACEHOLDER` | Groq API Key (`gsk_...`) |

배포 시 `index.html`의 `GROQ_KEY_PLACEHOLDER` 문자열이 자동으로 교체됩니다.

---

## 데이터 소스

장소 데이터는 Google Sheets CSV에서 실시간으로 로드됩니다.  
새 장소 추가 요청은 앱 내 **Save to Database** 버튼 → Google Apps Script로 전송됩니다.

---

## 기술 스택

- **Frontend:** Vanilla HTML / CSS / JavaScript (ES Modules)
- **Map:** [Leaflet.js](https://leafletjs.com/) + OpenStreetMap
- **AI:** [Groq API](https://console.groq.com/) (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`)
- **Deploy:** GitHub Pages + GitHub Actions

---

## 최근 수정 사항

- `writeReview()` null 데이터 크래시 수정
- Groq deprecated 모델(`mixtral-8x7b-32768`) → `llama-3.1-8b-instant` 교체
- 상세 지도 재진입 시 Leaflet 초기화 오류 수정
- 국가 선택 드롭다운 정렬 불일치 수정
- API Key 주입 방식 개선 (특수문자 안전 처리)
- 데이터 로드 실패 시 사용자 안내 메시지 추가

---

## License

MIT
