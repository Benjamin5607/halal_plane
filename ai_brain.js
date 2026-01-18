// ai_brain.js
// 아미나의 지능(RAG + General Knowledge)을 담당하는 모듈

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations;
        this.models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 🔍 [RAG] 질문과 관련된 장소만 DB에서 뽑아내기
    getRelevantPlaces(query, db, country) {
        if (!query) return [];
        const keywords = query.toLowerCase().split(" ");
        const candidates = db[country] || [];
        
        // 검색어와 일치하는 장소 찾기
        let relevant = candidates.filter(p => {
            const content = (
                (p.name || "") + " " + (p.name_ko || "") + " " + 
                (p.category || "") + " " + (p.desc_ko || "") + " " + (p.desc_en || "")
            ).toLowerCase();
            return keywords.some(k => content.includes(k));
        });

        // 🚨 중요: 관련 없는 데이터를 억지로 넣지 않음 (빈 배열이면 빈 대로 리턴)
        return relevant.slice(0, 10);
    }

    // 💬 채팅 답변 생성
    async ask(query, history, db, country, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🔑 Please set API Key first.";

        // 1. DB 검색
        const relevantPlaces = this.getRelevantPlaces(query, db, country);
        
        // 2. 컨텍스트 구성
        let contextStr = "";
        let mode = "EXTERNAL"; // 기본은 외부 지식 모드

        if (relevantPlaces.length > 0) {
            mode = "DATABASE"; // DB 매칭 성공
            contextStr = relevantPlaces.map(p => 
                `- [${p.name}] (in DB): ${p.desc_en || p.desc_ko}`
            ).join("\n");
        } else {
            contextStr = "No matching places found in our Halal Database.";
        }

        // 3. 시스템 프롬프트 (하이브리드 모드)
        const systemPrompt = `
        You are Amina, a witty Halal travel guide.
        Current Mode: ${mode} (Database vs General Knowledge)
        Current Country: ${country}
        
        [DATABASE SEARCH RESULTS]
        ${contextStr}

        [RULES]
        1. If [DATABASE SEARCH RESULTS] has items, recommend ONLY from there.
        2. If [DATABASE SEARCH RESULTS] is empty, use your GENERAL KNOWLEDGE to recommend famous places.
        3. 🚨 IMPORTANT: When recommending from GENERAL KNOWLEDGE (not in DB), add "(External)" after the name.
           Example: [BHC Chicken Geoje] (External)
        4. When recommending from DB, just use brackets. Example: [Eid]
        5. If recommending External places, clarify: "It's not in our DB, but I searched online!"
        6. Provide a short reason for recommendation.
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-4),
            { role: "user", content: query }
        ];

        return await this._callGroq(messages);
    }

    // 📝 리뷰 생성 (DB용 vs 외부용 분기 처리)
    async writeReview(placeName, country, isExternal = false, placeData = null) {
        let prompt = "";
        
        if (isExternal) {
            // 외부 장소: AI의 일반 상식으로 리뷰 작성
            prompt = `
            User is interested in "${placeName}" in ${country}.
            This place is NOT in our database.
            Based on general fame/reviews of this place (or chain), write a brief 3-line guide.
            1. What kind of food?
            2. Halal Probability (Is it Pork-free? Seafood? Certified?) - Be honest if unsure.
            3. Why is it famous?
            Language: ${this.t.ai}
            `;
        } else {
            // 내부 장소: DB 데이터 기반
            prompt = `
            Write a 5-line review for "${placeName}" in ${country}.
            Data: ${placeData.desc_en || placeData.desc_ko}
            Focus on Halal status and signature menu.
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
                    body: JSON.stringify({ model: model, messages: messages, temperature: 0.7 })
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
