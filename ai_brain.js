// ai_brain.js
// 아미나의 지능 (GPS Proximity + Global Search)

import { buildMapLink, getMapProvider, getMapProviderLabel } from './map_links.js';

const FALLBACK_CHAT_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3-32b"
];

const EXCLUDED_MODEL_PATTERNS = [
    /whisper/i,
    /orpheus/i,
    /prompt-guard/i,
    /safeguard/i,
    /compound/i,
    /tts/i
];

const LANG_NAMES = {
    KO: "Korean",
    EN: "English",
    JP: "Japanese",
    CN: "Chinese"
};

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations;
        this.models = [...FALLBACK_CHAT_MODELS];
        this.primaryModel = null;
        this.modelsLoaded = false;
        this.modelsLoading = null;
    }

    pickRandomModel(models) {
        if (!models.length) return null;
        return models[Math.floor(Math.random() * models.length)];
    }

    isChatModel(modelId) {
        if (!modelId || EXCLUDED_MODEL_PATTERNS.some((pattern) => pattern.test(modelId))) {
            return false;
        }
        return /llama|gpt-oss|qwen|mixtral|gemma|deepseek|kimi|maverick|scout/i.test(modelId);
    }

    rankModels(modelIds) {
        const preferredOrder = [
            "llama-3.3-70b-versatile",
            "openai/gpt-oss-120b",
            "qwen/qwen3-32b",
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "openai/gpt-oss-20b",
            "llama-3.1-8b-instant"
        ];

        return [...modelIds].sort((a, b) => {
            const aIdx = preferredOrder.indexOf(a);
            const bIdx = preferredOrder.indexOf(b);
            const aScore = aIdx === -1 ? preferredOrder.length : aIdx;
            const bScore = bIdx === -1 ? preferredOrder.length : bIdx;
            return aScore - bScore || a.localeCompare(b);
        });
    }

    async ensureModelsLoaded(force = false) {
        if (this.modelsLoaded && !force) return;
        if (this.modelsLoading) return this.modelsLoading;

        this.modelsLoading = (async () => {
            const discovered = await this.fetchAvailableModels();
            const candidates = discovered.length ? discovered : FALLBACK_CHAT_MODELS;
            const ranked = this.rankModels(candidates);
            this.primaryModel = this.pickRandomModel(ranked);
            this.models = [
                this.primaryModel,
                ...ranked.filter((model) => model !== this.primaryModel)
            ];
            this.modelsLoaded = true;
            console.info("[Amina] Groq models ready:", this.models.join(" -> "));
        })();

        try {
            await this.modelsLoading;
        } finally {
            this.modelsLoading = null;
        }
    }

    async fetchAvailableModels() {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) {
            return [...FALLBACK_CHAT_MODELS];
        }

        try {
            const res = await fetch("https://api.groq.com/openai/v1/models", {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                }
            });

            if (!res.ok) {
                console.warn("Groq model list unavailable:", res.status);
                return [...FALLBACK_CHAT_MODELS];
            }

            const data = await res.json();
            const ids = (data.data || [])
                .map((model) => model.id)
                .filter((id) => this.isChatModel(id));

            return ids.length ? ids : [...FALLBACK_CHAT_MODELS];
        } catch (error) {
            console.warn("Groq model discovery failed:", error);
            return [...FALLBACK_CHAT_MODELS];
        }
    }

    buildGoogleMapLink(name, address = "", country = "") {
        return buildMapLink({ name, address }, country);
    }

    getLanguageName(currentLang) {
        return LANG_NAMES[currentLang] || this.t.ai || "Korean";
    }

    buildTravelGuidePrompt(currentLang) {
        const language = this.getLanguageName(currentLang);
        const mapExamples = {
            KO: "중국 → Baidu Maps URL / 한국 → Naver Map URL / 기타 → Google Maps URL",
            EN: "China → Baidu Maps URL / Korea → Naver Map URL / others → Google Maps URL",
            JP: "中国 → Baidu Maps URL / 韓国 → Naver Map URL / その他 → Google Maps URL",
            CN: "中国 → 百度地图 URL / 韩国 → Naver Map URL / 其他 → Google Maps URL"
        };

        return `
You are Amina (아미나), a warm and trusted Halal travel guide for Muslim travelers worldwide.

[PERSONA - ALWAYS ON]
- You are ONLY a Halal travel guide. Never break character.
- Even if the user asks unrelated questions (weather, jokes, news, coding, personal chat), gently redirect and answer from a Muslim travel guide perspective.
- Connect every answer to travel: halal food, mosques/prayer, neighborhoods, transport, safety, culture, or trip planning.
- Tone: friendly, reassuring, like a local Muslim friend who knows the city well.

[LANGUAGE - STRICT]
- Respond ONLY in ${language}.
- Do NOT mix other languages in your reply.

[PLACE RECOMMENDATIONS - MANDATORY FORMAT]
For EACH recommended place, use EXACTLY this block (repeat for multiple places):

[Place Name] (External)
Why: 1-2 sentences explaining halal status, vibe, and why you recommend it.
Map: [exact map URL for the country]

Map provider rules:
- ${mapExamples[currentLang] || mapExamples.EN}
- For China: https://map.baidu.com/search/Place+Name+Address/@lng,lat,19z
- For Korea: https://map.naver.com/v5/search/Place+Name+Address?c=lng,lat,17,0,0,0,dh
- For others: https://www.google.com/maps/search/Place+Name+Address/@lat,lng,17z
- Always search by restaurant name and address; use coordinates only to center the search area.
- When DB results include Map: URL, copy that exact URL.

Rules:
- Use [Exact Place Name] without (External) for DB matches.
- Use [Place Name] (External) for general knowledge places.
- NEVER write "Google Maps:" — only use "Map:" followed by the URL.
- NEVER skip the Why line.
- NEVER paste the same URL as plain text outside the Map: line.
- The app converts Map: URLs into buttons automatically — do not describe the link in prose.

[HARAM SAFETY]
- Strictly warn about pork, alcohol, lard, and non-halal meat.
- Suggest safer Halal alternatives when needed.

[LOCATION LOGIC]
- If user asks for a specific city/region, prioritize that area over GPS.
- If user asks "near me" or gives no location, use GPS distance info when available.
- If GPS and viewed country conflict, GPS wins for "nearby" requests.
        `.trim();
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 99999;
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    getRelevantPlaces(query, db, userLoc) {
        if (!query) return [];
        const keywords = query.toLowerCase().split(" ");
        let allCandidates = [];

        Object.keys(db).forEach(country => {
            db[country].forEach(place => {
                let dist = userLoc ? this.calculateDistance(userLoc.lat, userLoc.lon, place.lat, place.lon) : 0;
                allCandidates.push({ ...place, origin_country: country, distance: dist });
            });
        });

        let scored = allCandidates.map(p => {
            let score = 0;
            const content = (
                (p.name || "") + " " + (p.name_ko || "") + " " +
                (p.category || "") + " " + (p.desc_ko || "") + " " + (p.desc_en || "") + " " +
                (p.address || "") + " " + (p.origin_country || "")
            ).toLowerCase();

            keywords.forEach(k => {
                if (k.length > 1 && content.includes(k)) score += 10;
            });

            if (userLoc && p.distance < 5) score += 20;
            else if (userLoc && p.distance < 20) score += 10;
            else if (userLoc && p.distance < 100) score += 5;

            return { place: p, score: score };
        });

        return scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.place.distance - b.place.distance)
            .map(item => {
                const p = item.place;
                const distInfo = userLoc ? `(${item.place.distance.toFixed(1)}km away)` : "";
                const mapLink = buildMapLink(p, p.origin_country);
                return { ...p, distInfo, mapLink, mapProvider: getMapProvider(p.origin_country) };
            })
            .slice(0, 10);
    }

    async ask(query, history, db, currentCountry, userLoc, currentLang = "KO") {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) {
            return currentLang === "KO"
                ? "🔑 Groq API Key를 먼저 설정해 주세요."
                : "🔑 Please set your Groq API Key first.";
        }

        await this.ensureModelsLoaded();

        const relevantPlaces = this.getRelevantPlaces(query, db, userLoc);
        const contextStr = relevantPlaces.length > 0
            ? relevantPlaces.map(p =>
                `- [${p.name}] (${p.origin_country}, ${p.address || "no address"}) ${p.distInfo || ""}\n  Why hint: ${p.desc_en || p.desc_ko || "Halal-friendly spot"}\n  Map: ${p.mapLink}`
            ).join("\n")
            : "No direct match in DB. You may suggest well-known Halal-friendly places using (External) tag.";

        const systemPrompt = `
${this.buildTravelGuidePrompt(currentLang)}

[USER CONTEXT]
- User message: "${query}"
- GPS: ${userLoc ? `Lat ${userLoc.lat}, Lon ${userLoc.lon}` : "Unknown"}
- Currently viewed country in app: ${currentCountry} (ignore if it conflicts with query or GPS)

[DATABASE SEARCH RESULTS]
${contextStr}
        `.trim();

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-6),
            { role: "user", content: query }
        ];

        return await this._callGroq(messages);
    }

    async writeReview(placeName, country, isExternal = false, placeData = null) {
        await this.ensureModelsLoaded();
        const language = this.getLanguageName(this.t.langCode || "KO");
        const mapLink = buildMapLink(
            placeData || { name: placeName, address: "" },
            country
        );
        const mapLabel = getMapProviderLabel(country, this.t.langCode || "KO");

        let prompt = "";
        if (isExternal) {
            prompt = `
${this.buildTravelGuidePrompt(this.t.langCode || "KO")}

Write a short travel guide note for "${placeName}" in ${country}.
This place is NOT in our database yet.
Include: food type, honest Halal assessment, why travelers visit, and this map link:
Map: ${mapLink}
Language: ${language}
Keep it under 6 lines.
            `;
        } else if (placeData) {
            prompt = `
${this.buildTravelGuidePrompt(this.t.langCode || "KO")}

Write a warm travel guide review for "${placeName}" in ${country}.
Reference data: ${placeData.desc_en || placeData.desc_ko || "No description available."}
Focus on Halal status and why you recommend it.
Include this map link on its own line:
Map: ${mapLink}
(${mapLabel})
Language: ${language}
Keep it under 8 lines.
            `;
        } else {
            prompt = `
${this.buildTravelGuidePrompt(this.t.langCode || "KO")}

Write a brief travel guide note for "${placeName}" in ${country}.
This place was requested but is not yet verified in our database.
Include: food type, Halal guess, why visit, and:
Map: ${mapLink}
Language: ${language}
            `;
        }

        return await this._callGroq([{ role: "user", content: prompt.trim() }]);
    }

    async _callGroq(messages) {
        await this.ensureModelsLoaded();
        let lastError = "";

        for (let model of this.models) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({ model, messages, temperature: 0.4 })
                });

                if (res.ok) {
                    const data = await res.json();
                    return data.choices[0].message.content;
                }

                const errBody = await res.text();
                lastError = `${model}: ${res.status} ${errBody.slice(0, 160)}`;
                console.error("Groq API error:", lastError);

                if (res.status === 404 || /model.*decommissioned|model_not_found/i.test(errBody)) {
                    this.models = this.models.filter((item) => item !== model);
                }
            } catch (e) {
                lastError = e.message;
                console.error(e);
            }
        }

        if (lastError.includes("401")) {
            return "🔑 Invalid API Key. Please check your Groq API key.";
        }
        return "Amina is currently offline. Please try again.";
    }
}
