// ai_brain.js
// 아미나의 지능(RAG)을 담당하는 모듈입니다.

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations; // 현재 언어 설정
        this.models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 🔍 [RAG 핵심] 질문과 관련된 장소만 DB에서 뽑아내기
    getRelevantPlaces(query, db, country) {
        if (!query) return [];
        const keywords = query.toLowerCase().split(" ");
        const candidates = db[country] || [];
        
        // 검색어와 일치하는(이름, 설명, 카테고리) 장소 찾기
        let relevant = candidates.filter(p => {
            const content = (
                (p.name || "") + " " + 
                (p.name_ko || "") + " " + 
                (p.category || "") + " " + 
                (p.label || "") + " " + 
                (p.desc_ko || "") + " " + 
                (p.desc_en || "")
            ).toLowerCase();
            
            // 키워드 중 하나라도 포함되면 관련 있는 것으로 간주
            return keywords.some(k => content.includes(k));
        });

        // 결과가 너무 적으면 인기 장소(앞쪽 데이터) 약간 섞어주기 (아무말 방지)
        if (relevant.length === 0) {
            return candidates.slice(0, 5);
        }
        
        // 토큰 절약을 위해 상위 10개만 리턴
        return relevant.slice(0, 10);
    }

    // 💬 채팅 답변 생성
    async ask(query, history, db, country, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🔑 Please set API Key first.";

        // 1. 질문과 관련된 장소만 추리기 (RAG)
        const relevantPlaces = this.getRelevantPlaces(query, db, country);
        
        // 2. AI에게 먹여줄 데이터 요약 (이름, 카테고리, 특징만)
        const contextStr = relevantPlaces.map(p => 
            `- [${p.name} / ${p.name_ko || p.name}] (${p.category}): ${p.desc_en || p.desc_ko || "No desc"}`
        ).join("\n");

        // 3. 시스템 프롬프트 (페르소나 + 데이터 주입)
        const systemPrompt = `
        You are Amina, a witty Halal travel guide.
        Current Language: ${this.t.ai}
        User Location: ${userLoc ? userLoc.lat + "," + userLoc.lon : "Unknown"}
        
        [SEARCH RESULTS FROM DATABASE]
        ${contextStr}

        [RULES]
        1. ONLY recommend places from the [SEARCH RESULTS] list above. Do NOT hallucinate.
        2. If the user asks for Chicken, find Chicken places in the list. Do NOT recommend Seafood.
        3. If the list is empty or irrelevant, say "I couldn't find exactly that in our Halal list, but how about these?"
        4. Always wrap place names in [ ]. Example: [Eid].
        5. Keep it short, friendly, and helpful.
        `;

        // 4. API 호출
        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-4), // 최근 대화 4개 기억
            { role: "user", content: query }
        ];

        return await this._callGroq(messages);
    }

    // 📝 상세 리뷰 생성
    async writeReview(place, country) {
        const prompt = `
        Write a 5-line detailed Halal review for "${place.name} (${place.name_ko})" in ${country}.
        Language: ${this.t.ai}
        Context: ${place.desc_en || place.desc_ko}
        Category: ${place.category}
        
        Structure:
        1. What is this place?
        2. Halal/Vegan Status
        3. Best Menu or Feature
        4. Atmosphere
        5. Amina's Tip
        `;
        
        return await this._callGroq([{role: "user", content: prompt}]);
    }

    async _callGroq(messages) {
        for (let model of this.models) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
                    body: JSON.stringify({ model: model, messages: messages, temperature: 0.5 }) // 온도를 낮춰서 정확도 향상
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.choices[0].message.content;
                }
            } catch (e) { console.error(e); }
        }
        return "Amina is praying (Network Error). Please try again.";
    }
}
