// ai_brain.js
// 아미나의 지능 (GPS Proximity + Global Search)

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

    // 📏 거리 계산 (Haversine Formula)
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

            let keywordMatch = false;
            keywords.forEach(k => {
                if (content.includes(k)) {
                    score += 10;
                    keywordMatch = true;
                }
            });

            if (userLoc && p.distance < 5) score += 20;
            else if (userLoc && p.distance < 20) score += 10;
            else if (userLoc && p.distance < 100) score += 5;

            return { place: p, score: score, match: keywordMatch };
        });

        return scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.place.distance - b.place.distance)
            .map(item => {
                let distInfo = userLoc ? `(${item.place.distance.toFixed(1)}km away)` : "";
                return { ...item.place, distInfo: distInfo };
            })
            .slice(0, 10);
    }

    async ask(query, history, db, currentCountry, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🔑 Please set API Key first.";
        await this.ensureModelsLoaded();

        const relevantPlaces = this.getRelevantPlaces(query, db, userLoc);
        let contextStr = relevantPlaces.length > 0
            ? relevantPlaces.map(p =>
                `- [${p.name}] (${p.origin_country}, ${p.address}) ${p.distInfo || ""}: ${p.desc_en || p.desc_ko}`
            ).join("\n")
            : "No direct match in DB.";

        const systemPrompt = `
        You are Amina, a smart Halal travel guide.
        
        [USER CONTEXT]
        - Query: "${query}"
        - User's GPS Location: ${userLoc ? `Lat ${userLoc.lat}, Lon ${userLoc.lon}` : "Unknown"}
        - Currently Viewed Map: ${currentCountry} (IGNORE this if it conflicts with Query or GPS)

        [SEARCH RESULTS FROM DB]
        ${contextStr}

        [DECISION RULES]
        1. 🎯 **LOCATION PRIORITY:**
           - **Rule A (Explicit Request):** If the user asks for a specific place (e.g., "Seoul", "Busan"), ONLY recommend places in that region. Ignore the User's GPS and Viewed Map.
           - **Rule B (Nearby Request):** If the user asks "Near me", "Around here", or just "Chicken" (without location), recommend the CLOSEST places based on the 'km away' info in [SEARCH RESULTS].
           - **Rule C (Conflict):** If User is in Korea (GPS) but viewing Japan Map, and asks "Best food nearby", recommend KOREAN food (GPS wins).

        2. 🚨 **HARAM CHECK:**
           - Strict warning on Pork/Alcohol. Suggest Halal alternatives.

        3. **FORMAT:**
           - Recommended: [Place Name]
           - External Knowledge: [Place Name] (External)
           - Mention distance if available (e.g., "It's just 2km away!").
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-4),
            { role: "user", content: query }
        ];

        return await this._callGroq(messages);
    }

    async writeReview(placeName, country, isExternal = false, placeData = null) {
        await this.ensureModelsLoaded();

        let prompt = "";
        if (isExternal) {
            prompt = `
            User is interested in "${placeName}" in ${country}.
            This place is NOT in our database.
            Write a brief 3-line guide based on general knowledge.
            1. Food Type?
            2. Halal Status? (Honest guess)
            3. Why famous?
            Language: ${this.t.ai}
            `;
        } else if (placeData) {
            prompt = `
            Write a 5-line review for "${placeName}" in ${country}.
            Data: ${placeData.desc_en || placeData.desc_ko || "No description available."}
            Focus on Halal status.
            Language: ${this.t.ai}
            `;
        } else {
            prompt = `
            Write a brief 3-line guide for "${placeName}" in ${country}.
            This place was requested but is not yet in our database.
            1. Food Type?
            2. Halal Status? (Honest guess)
            3. Why might travelers visit?
            Language: ${this.t.ai}
            `;
        }
        return await this._callGroq([{ role: "user", content: prompt }]);
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
                    body: JSON.stringify({ model, messages, temperature: 0.3 })
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
