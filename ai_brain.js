// ai_brain.js
// 아미나의 지능 (Global Search + RAG + Halal Guard)

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations;
        this.models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 🔍 [Global RAG] 전 세계 DB에서 검색 (국경 초월)
    getRelevantPlaces(query, db, currentCountry) {
        if (!query) return [];
        const keywords = query.toLowerCase().split(" ");
        
        let allCandidates = [];

        // 1. 모든 국가의 데이터를 평탄화(Flatten)하여 하나의 리스트로 만듦
        // 데이터에 'origin_country' 속성을 임시로 추가해서 어디 건지 알게 함
        Object.keys(db).forEach(country => {
            db[country].forEach(place => {
                allCandidates.push({ ...place, origin_country: country });
            });
        });

        // 2. 검색 및 점수 매기기 (Scoring System)
        let scored = allCandidates.map(p => {
            let score = 0;
            const content = (
                (p.name || "") + " " + (p.name_ko || "") + " " + 
                (p.category || "") + " " + (p.desc_ko || "") + " " + (p.desc_en || "") + " " +
                (p.address || "") + " " + (p.origin_country || "")
            ).toLowerCase();

            // 키워드 매칭 점수
            keywords.forEach(k => {
                if (content.includes(k)) score += 1;
                // 국가나 도시 이름이 일치하면 가산점 (명동, 서울, Korea 등)
                if ((p.address && p.address.toLowerCase().includes(k)) || 
                    (p.origin_country.toLowerCase().includes(k))) {
                    score += 3; // 강력한 가산점!
                }
            });

            return { place: p, score: score };
        });

        // 3. 점수 높은 순 정렬 및 필터링 (점수 0점은 제외)
        let relevant = scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.place);

        // 4. 결과가 너무 많으면 상위 10개만, 만약 결과가 없으면 '현재 국가' 데이터에서 3개 정도 랜덤 추천 (fallback)
        if (relevant.length === 0 && db[currentCountry]) {
            return []; // 아예 없으면 외부 검색(External)으로 유도하기 위해 빈 배열 반환
        }

        return relevant.slice(0, 10);
    }

    // 💬 채팅 답변 생성
    async ask(query, history, db, currentCountry, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🔑 Please set API Key first.";

        // 글로벌 검색 실행
        const relevantPlaces = this.getRelevantPlaces(query, db, currentCountry);
        
        // 컨텍스트 구성
        let contextStr = "";
        let mode = "EXTERNAL"; 

        if (relevantPlaces.length > 0) {
            mode = "DATABASE"; 
            // 🔥 중요: 데이터 줄 때 [국가/도시] 정보를 꼭 같이 줌
            contextStr = relevantPlaces.map(p => 
                `- [${p.name}] (${p.origin_country}, ${p.address}): ${p.desc_en || p.desc_ko}`
            ).join("\n");
        } else {
            contextStr = "No direct match in Halal DB.";
        }

        // 시스템 프롬프트 (위치 검증 로직 강화)
        const systemPrompt = `
        You are Amina, a witty Halal travel guide.
        Current User Location/Map: ${currentCountry}
        User Query: "${query}"
        
        [DATABASE SEARCH RESULTS]
        ${contextStr}

        [CRITICAL RULES]
        1. 📍 **LOCATION CHECK (Most Important):** - Check the User Query for location keywords (e.g., "Seoul", "Tokyo", "Myeongdong").
           - Check the [DATABASE SEARCH RESULTS] for their 'origin_country' and 'address'.
           - **ONLY recommend places that match the requested location.**
           - IF the user asks for "Seoul" but the DB results are in "Tokyo", ignore the DB results and use your General Knowledge (External).
           - IF the user asks for "Seoul" and the DB result is in "Seoul", recommend it confidently.

        2. 🚨 **HARAM CHECK:**
           - If user asks for Pork/Alcohol/Bacon, warn them it is NOT Halal. 
           - Suggest Halal alternatives (e.g., "Beef BBQ" instead of "Pork Belly").

        3. **FORMAT:**
           - If recommending from DB: [Place Name]
           - If recommending from General Knowledge: [Place Name] (External)
           - Keep it short and helpful.
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-4),
            { role: "user", content: query }
        ];

        return await this._callGroq(messages);
    }

    // 📝 리뷰 생성
    async writeReview(placeName, country, isExternal = false, placeData = null) {
        let prompt = "";
        if (isExternal) {
            prompt = `
            User is interested in "${placeName}" in ${country}.
            This place is NOT in our database.
            Based on general fame, write a brief 3-line guide.
            1. What kind of food?
            2. Halal Probability (Is it Pork-free? Seafood?) - Be honest.
            3. Why is it famous?
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
