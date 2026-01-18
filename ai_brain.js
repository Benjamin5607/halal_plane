// ai_brain.js
// 아미나의 지능(RAG + Halal Guard)을 담당하는 모듈

export class AIBrain {
    constructor(apiKey, translations) {
        this.apiKey = apiKey;
        this.t = translations;
        this.models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"];
    }

    // 🔍 [RAG] 질문과 관련된 장소 DB 검색
    getRelevantPlaces(query, db, country) {
        if (!query) return [];
        const keywords = query.toLowerCase().split(" ");
        const candidates = db[country] || [];
        
        let relevant = candidates.filter(p => {
            const content = (
                (p.name || "") + " " + (p.name_ko || "") + " " + 
                (p.category || "") + " " + (p.desc_ko || "") + " " + (p.desc_en || "")
            ).toLowerCase();
            return keywords.some(k => content.includes(k));
        });

        // 🚨 중요: 검색 결과가 없으면 억지로 다른 걸 끼워넣지 않고 빈 배열 반환
        return relevant.slice(0, 10);
    }

    // 💬 채팅 답변 생성 (할랄 가드 로직 추가)
    async ask(query, history, db, country, userLoc) {
        if (!this.apiKey || this.apiKey.includes("PLACEHOLDER")) return "🔑 Please set API Key first.";

        const relevantPlaces = this.getRelevantPlaces(query, db, country);
        
        // 컨텍스트 구성
        let contextStr = "";
        let mode = "EXTERNAL"; 

        if (relevantPlaces.length > 0) {
            mode = "DATABASE"; 
            contextStr = relevantPlaces.map(p => 
                `- [${p.name}] (in DB): ${p.desc_en || p.desc_ko}`
            ).join("\n");
        } else {
            contextStr = "No direct match in Halal DB.";
        }

        // 🔥 [시스템 프롬프트 대폭 수정] 
        // 1. Haram(돼지고기, 술) 감지 시 경고 우선
        // 2. 묻지 않은 엉뚱한 음식 추천 금지
        const systemPrompt = `
        You are Amina, a strict but friendly Halal travel guide.
        Current Mode: ${mode}
        Current Country: ${country}
        User Query: "${query}"
        
        [DATABASE SEARCH RESULTS]
        ${contextStr}

        [CRITICAL RULES]
        1. 🚨 **HARAM CHECK:** If the user asks for Pork, Samgyeopsal, Bacon, Ham, or Alcohol:
           - CLEARLY state that it is **NOT Halal**.
           - Do **NOT** recommend a random Halal place (like Chicken) unless explicitly asked for an alternative.
           - Instead, suggest a *similar* Halal option (e.g., "Samgyeopsal is pork. How about Beef BBQ or Duck instead?").

        2. **RELEVANCE:** - If the user asks for "Ulleungdo", do NOT recommend places in Seoul or Busan.
           - If the user asks for "Chicken", do NOT recommend "Seafood".
           
        3. **RECOMMENDATION LOGIC:**
           - If [DATABASE SEARCH RESULTS] has items, recommend ONLY from there.
           - If [DATABASE SEARCH RESULTS] is empty, use your GENERAL KNOWLEDGE.
           - When using GENERAL KNOWLEDGE, mark the name with "(External)". Ex: [Ulleungdo Yakso Beef] (External).
           
        4. **FORMAT:**
           - Keep it short.
           - Always wrap place names in [ ]. Example: [Eid].
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
                    body: JSON.stringify({ model: model, messages: messages, temperature: 0.3 }) // 온도를 낮춰서 엉뚱한 소리 차단
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
