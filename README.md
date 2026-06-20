# Halal Plane 🕌

A Progressive Web App (PWA) for Muslim travelers to discover Halal restaurants, cafes, and mosques worldwide. Built around **Amina**, an AI Halal travel guide powered by Groq LLM, with GPS-based recommendations, an interactive world map, and a digital passport stamp feature.

**Live Demo:** https://benjamin5607.github.io/halal_plane/

---

## Features

| Feature | Description |
|---------|-------------|
| 🗺️ **Place Explorer** | Browse Halal spots from a Google Sheets database, filterable by country and category |
| 🤖 **Amina AI Guide** | Chat with a Halal travel guide that answers in your language (KO / EN / JP / CN) |
| 📍 **GPS Recommendations** | Distance-based sorting and "near me" suggestions using your current location |
| 📝 **AI Reviews** | One-tap Halal reviews for any place, with Google Maps links |
| 🌍 **World Map** | Leaflet-powered map with markers for all listed places |
| 🎫 **Passport Stamps** | Track visited places locally (stored in browser `localStorage`) |
| ➕ **Community Requests** | Submit new places via Google Apps Script for AI review and database inclusion |
| 📱 **PWA Ready** | Installable on mobile home screen via `manifest.json` |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES Modules) — no build step required |
| **Maps** | [Leaflet.js 1.9.4](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) tiles |
| **AI** | [Groq Cloud API](https://console.groq.com/) — dynamic model discovery via `/v1/models`, random assignment from suitable chat models, automatic fallback on failure |
| **Data Store** | Google Sheets (published CSV) + Google Apps Script Web App |
| **Backend Scripts** | Google Apps Script (`gas/Code.gs`) — data proxy, place requests, AI mining & auditing |
| **Hosting** | [GitHub Pages](https://pages.github.com/) |
| **CI/CD** | GitHub Actions (`.github/workflows/deploy.yml`) — auto-deploy on push to `main` |
| **Local Storage** | Browser `localStorage` for visited places and request history |

### Supported Groq Models (auto-selected)

The app discovers available models at runtime and excludes non-chat models (Whisper, Orpheus, Compound, etc.). Fallback list:

- `llama-3.3-70b-versatile`
- `llama-3.1-8b-instant`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3-32b`

---

## Project Structure

```
halal_plane/
├── index.html              # Main UI, navigation, data loading, chat interface
├── ai_brain.js             # Amina AI module (Groq API, GPS search, persona prompts)
├── map_links.js            # Map link builder (Google / Naver / Baidu, coordinate-first)
├── gas/
│   └── Code.gs             # Google Apps Script — Web App API, mining, auto-auditor
├── manifest.json           # PWA manifest (icons, theme, display mode)
├── amina.png               # App icon & floating Amina chat button
├── bg.png                  # Background image
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Pages deployment + API key injection
```

---

## How to Use

### 1. Home Screen
- Select a **country** from the dropdown.
- Filter by category: All, Asian, Western, Middle East, Cafe, Mosque.
- Tap **AI REVIEW** for an Amina-generated Halal guide, or **MAP** to open directions.
- Switch language with **KR / EN / JP / CN** buttons (top right).

### 2. Amina AI Chat
- Tap the **Amina floating button** (bottom right) to open the chat.
- Ask anything — Amina always responds as a Halal travel guide in your selected language.
- Place recommendations include a **reason** and a **Google Maps link**.
- Tap a recommended place button to open a detailed AI review.

### 3. World Map
- Tap **Explore World** to view all places on an interactive map.
- Search by name, or tap **◎** to jump to your GPS location.

### 4. Passport
- Tap **🎫** (top left) to view stamps for places you've visited.
- Stamp a place from its detail page after an AI review.

### 5. Save a New Place
- When Amina suggests an external place, tap **Save to Database**.
- The request is sent to Google Apps Script and queued in the **Candidates** sheet for AI review.

### Navigation
Every sub-page (Passport, Map, Chat, Detail) has:
- **← Back** — return to the previous screen
- **🏠 Home** — return to the main list

---

## Getting Started (Local Development)

This project uses ES Modules, so you **must serve it over HTTP** (opening `index.html` directly via `file://` will not work).

### Prerequisites
- A modern browser (Chrome, Safari, Firefox, Edge)
- A [Groq API Key](https://console.groq.com/) (`gsk_...`)
- Python 3 or Node.js (for local server)

### Run locally

```bash
# Clone the repository
git clone https://github.com/Benjamin5607/halal_plane.git
cd halal_plane

# Option A: Python
python3 -m http.server 8080

# Option B: Node.js
npx serve .
```

Open `http://localhost:8080` in your browser. When prompted, paste your Groq API Key.

### Configuration (`index.html`)

| Constant | Description |
|----------|-------------|
| `GROQ_KEY_PLACEHOLDER` | Replaced at deploy time via GitHub Actions secret |
| `SHEET_CSV_URL` | Published Google Sheets CSV URL |
| `GAS_URL` | Google Apps Script Web App deployment URL |

---

## Deployment (GitHub Pages)

Pushing to the `main` branch triggers automatic deployment via GitHub Actions.

### 1. Set GitHub Secret

Go to **Repository → Settings → Secrets and variables → Actions**:

| Secret Name | Value |
|-------------|-------|
| `GROQ_KEY_PLACEHOLDER` | Your Groq API Key (`gsk_...`) |

The deploy workflow replaces `GROQ_KEY_PLACEHOLDER` in `index.html` before uploading to Pages.

### 2. Enable GitHub Pages

Go to **Repository → Settings → Pages** and set the source to **GitHub Actions**.

---

## Google Apps Script Setup

The Web App provides a data fallback and handles user place requests. It also runs server-side AI mining and auditing.

### Deploy Steps

1. Open your Google Sheet → **Extensions → Apps Script**
2. Paste the contents of [`gas/Code.gs`](gas/Code.gs)
3. Set your Groq API Key (choose one):
   - **Recommended:** Run `setGroqApiKeyOnce()` once with your key, then remove the key string from the function
   - Or set the `GROQ_API_KEY` constant directly
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL into `GAS_URL` in `index.html`
6. *(Optional)* Run `setupAuditorTrigger()` once to auto-review candidates every 3 hours

### Web App API

| Action | Method | Parameters | Response |
|--------|--------|------------|----------|
| `data` | GET | — | `{ ok: true, places: [...] }` — all places from Sheet1 |
| `add` | GET/POST | `name`, `country` | `{ ok: true, message: "..." }` — queues place in Candidates |

### Server-side Functions

| Function | Description |
|----------|-------------|
| `minePlaces(location)` | AI-mining: finds 3 Halal places for a given location |
| `consultAmina(name, country)` | AI auditor: strict Halal compliance check |
| `autoReviewCandidates()` | Reviews up to 5 pending candidates and moves approved ones to Sheet1 |
| `setupAuditorTrigger()` | Creates a 3-hour time-based trigger for auto-review |

---

## Data Pipeline

```
Google Sheets (Sheet1)
  │
  ├── Published CSV ──────────► Web App (primary load, with retry + cache bust)
  │
  └── Google Apps Script
        ├── action=data ──────► Web App fallback load
        ├── action=add ───────► Candidates sheet (Pending)
        ├── minePlaces() ─────► Candidates sheet (AI-mined)
        └── autoReviewCandidates()
              └── consultAmina() ──► Approved → Sheet1
```

Place data schema (Sheet1 columns):

```
Country | name | name_ko | lat | lon | category | label | desc_ko | desc_en | address
```

---

## Amina AI Persona

Amina is configured to:

- **Always respond in the user's selected language** (Korean, English, Japanese, or Chinese)
- **Stay in character** as a Halal travel guide — even off-topic questions are redirected to travel, food, prayer, or culture
- **Include recommendation reasons** and **Google Maps links** for every place suggestion
- **Warn strictly** about pork, alcohol, and non-Halal ingredients

---

## Changelog

- Dynamic Groq model discovery + random assignment + automatic fallback
- UI navigation: back/home buttons on all sub-pages with history stack
- Multilingual UI labels (KO / EN / JP / CN)
- Amina travel guide persona with mandatory Google Maps links
- Google Sheets CSV load: retry, cache bust, CRLF normalization
- Google Apps Script data fallback and verified save requests
- Integrated GAS mining pipeline (`minePlaces`, `autoReviewCandidates`)
- Fixed Leaflet map re-initialization, null review crash, country dropdown sort

---

## License

MIT
