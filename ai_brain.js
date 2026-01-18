// ai_brain.js
// 아미나의 지능 (GPS Proximity + Global Search)

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations;
        this.models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 📏 거리 계산 (Haversine Formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 99999; // 좌표 없으면 아주 먼 곳으로 취급
        const R = 6371; // 지구 반지름 (km)
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // 거리 (km)
    }

    // 🔍 [Smart Search] GPS 위치와 검색어 기반 탐색
    getRelevantPlaces(query, db, userLoc) {
        if (!query) return [];
        const keywords = query.toLowerCase().split(" ");
        let allCandidates = [];

        // 1. 모든 국가 데이터를 하나로 통합 (국경 없애기)
        Object.keys(db).forEach(country => {
            db[country].forEach(place => {
                // 내 위치가 있으면 거리 계산, 없으면 0
                let dist = userLoc ? this.calculateDistance(userLoc.lat, userLoc.lon, place.lat, place.lon) : 0;
                allCandidates.push({ ...place, origin_country: country, distance: dist });
            });
        });

        // 2. 점수 매기기 (검색어 일치 + 거리 점수)
        let scored = allCandidates.map(p => {
            let score = 0;
            const content = (
                (p.name || "") + " " + (p.name_ko || "") + " " + 
                (p.category || "") + " " + (p.desc_ko || "") + " " + (p.desc_en || "") + " " +
                (p.address || "") + " " + (p.origin_country || "")
            ).toLowerCase();

            // (A) 검색어 매칭 점수
            let keywordMatch = false;
            keywords.forEach(k => {
                if (content.includes(k)) {
                    score += 10; // 키워드 맞으면 높은 점수
                    keywordMatch = true;
                }
            });

            // (B) 거리 점수 (키워드가 지역명이 아닐 때 유용)
            // 5km 이내면 가산점, 20km 이내면 소폭 가산
            if (userLoc && p.distance < 5) score += 20; 
            else if (userLoc && p.distance < 20) score += 10;
            else if (userLoc && p.distance < 100) score += 5;

            // (C) 만약 검색어가 명확한 지명(Seoul, Tokyo 등)이라면 거리 점수 무시 가능
            // (AI가 판단하도록 정보만 넘김)

            return { place: p, score: score, match: keywordMatch };
        });

        // 3. 정렬: 점수 높은 순 -> 거리 가까운 순
        let relevant = scored
            .filter(item => item.score > 0) // 관련 있는 것만
            .sort((a, b) => b.score - a.score || a.place.distance - b.place.distance)
            .map(item => {
                // AI에게 줄 정보에 '거리' 정보 추가
                let distInfo = userLoc ? `(${item.place.distance.toFixed(1)}km away)` : "";
                return { ...item.place, distInfo: distInfo };
            });

        return relevant.slice(0, 10);
    }

    // 💬 채팅 답변 생성
    async ask(query, history, db, currentCountry, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🔑 Please set API Key first.";

        // 스마트 검색 실행 (GPS 정보 전달)
        const relevantPlaces = this.getRelevantPlaces(query, db, userLoc);
        
        let contextStr = "";
        let mode = "EXTERNAL"; 

        if (relevantPlaces.length > 0) {
            mode = "DATABASE"; 
            // 🔥 AI에게 [거리 정보]와 [국가 정보]를 같이 줌
            contextStr = relevantPlaces.map(p => 
                `- [${p.name}] (${p.origin_country}, ${p.address}) ${p.distInfo || ""}: ${p.desc_en || p.desc_ko}`
            ).join("\n");
        } else {
            contextStr = "No direct match in DB.";
        }

        // 🚨 [시스템 프롬프트] 지도 선택 무시하고 GPS와 질문만 따르도록 지시
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

    // 📝 리뷰 생성 (기존 유지)
    async writeReview(placeName, country, isExternal = false, placeData = null) {
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
        } else {
            prompt = `
            Write a 5-line review for "${placeName}" in ${country}.
            Data: ${placeData.desc_en || placeData.desc_ko}
            Focus on Halal status.
            Language: ${this.t.ai}
            `;
        }
        return await this._callGroq([{role: "user", content: prompt}]);
    }

    async _callGroq(messages) {
        for (let model of this.models) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                    body: JSON.stringify({ model: model, messages: messages, temperature: 0.3 }) 
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.choices[0].message.content;
                }
            } catch (e) { console.error(e); }
        }
        return "Amina is currently offline. Please try again.";
    }
}
