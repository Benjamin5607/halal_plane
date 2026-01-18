// ai_brain.js
// 아미나의 지능을 담당하는 파일입니다.

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations; // 언어팩
        this.models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 🔍 핵심 기술: 질문과 관련된 장소만 DB에서 뽑아내기 (Simple RAG)
    getRelevantPlaces(query, db, country) {
        const keywords = query.toLowerCase().split(" ");
        const candidates = db[country] || [];
        
        // 검색어와 일치하는(이름, 설명, 카테고리) 장소 찾기
        const relevant = candidates.filter(p => {
            const content = (p.name + " " + p.name_ko + " " + p.category + " " + p.desc_ko + " " + (p.desc_en||"")).toLowerCase();
            return keywords.some(k => content.includes(k));
        });

        // 관련 장소가 없으면 인기 장소 5개 랜덤 리턴 (아무말 방지)
        if (relevant.length === 0) return candidates.slice(0, 5);
        
        // 너무 많으면 상위 10개만 (토큰 절약)
        return relevant.slice(0, 10);
    }

    async ask(query, history, db, country, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🔑 Please set API Key first.";

        // 1. 질문과 관련된 장소만 추리기
        const relevantPlaces = this.getRelevantPlaces(query, db, country);
        
        // 2. AI에게 먹여줄 데이터 요약 (이름, 카테고리, 특징만)
        const contextStr = relevantPlaces.map(p => 
            `- [${p.name}(${p.name_ko || p.name})] (${p.category}): ${p.desc_en || p.desc_ko}`
        ).join("\n");

        // 3. 시스템 프롬프트 강화
        const systemPrompt = `
        You are Amina, a witty Halal travel guide.
        Current Language: ${this.t.ai}
        User Location: ${userLoc ? userLoc.lat + "," + userLoc.lon : "Unknown"}
        
        [AVAILABLE PLACES MATCHING USER REQUEST]
        ${contextStr}

        [RULES]
        1. ONLY recommend places from the list above. Do NOT hallucinate.
        2. If the user asks for Chicken, find Chicken places in the list. Do NOT recommend Seafood.
        3. If the list is empty or irrelevant, say "I couldn't find exactly that, but how about these?"
        4. Always wrap place names in [ ]. Example: [Eid].
        5. Keep it short and friendly.
        `;

        // 4. API 호출
        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-4), // 최근 대화 4개 기억
            { role: "user", content: query }
        ];

        return await this._callGroq(messages);
    }

    async _callGroq(messages) {
        for (let model of this.models) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                    body: JSON.stringify({ model: model, messages: messages, temperature: 0.5 }) // 온도를 낮춰서 헛소리 차단
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.choices[0].message.content;
                }
            } catch (e) { console.error(e); }
        }
        return "Amina is praying (Network Error). Try again.";
    }
    
    // 리뷰 작성 기능도 이쪽으로 분리
    async writeReview(place, country, lang) {
        const prompt = `
        Write a 5-line detailed Halal review for "${place.name}" in ${country}.
        Language: ${this.t.ai}
        Key Info: ${place.desc_en || place.desc_ko}
        Focus on: Halal Status, Flavor, and Atmosphere.
        `;
        return await this._callGroq([{role: "user", content: prompt}]);
    }
}
