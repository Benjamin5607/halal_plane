// ==========================================
// Halal Plane - Google Apps Script (Final)
// Web App (doGet/doPost) + Mining + Auto Auditor
// ==========================================

// 🔑 Groq API Key: Script Properties에 GROQ_API_KEY 로 저장하는 것을 권장합니다.
//    (한 번만 실행) setGroqApiKeyOnce() 함수 참고
const GROQ_API_KEY = ""; // 또는 여기에 직접 입력 (비공개 유지!)
const SPREADSHEET_ID = "1KOZXnv9ZcUVrjqAYPtpJaV1WjKQ86fJ3rN2AcLTSqWI";

const DB_SHEET_NAME = "Sheet1";
const CANDIDATES_SHEET_NAME = "Candidates";
const CANDIDATE_HEADERS = ["Status", "Country", "Name", "Category", "Label", "Desc", "Address", "Lat", "Lon"];

const FALLBACK_GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b"
];

const EXCLUDED_MODEL_PATTERNS = [/whisper/i, /orpheus/i, /prompt-guard/i, /safeguard/i, /compound/i, /tts/i];

// ==========================================
// 🌐 Web App Entry (Halal Plane 프론트 연동)
// ==========================================

function doGet(e) {
  return handleRequest_(e.parameter || {});
}

function doPost(e) {
  const params = Object.assign({}, e.parameter || {});

  if (e.postData && e.postData.type === "application/json") {
    try {
      Object.assign(params, JSON.parse(e.postData.contents || "{}"));
    } catch (error) {
      return jsonResponse_({ ok: false, error: "Invalid JSON body" });
    }
  }

  return handleRequest_(params);
}

function handleRequest_(params) {
  const action = String(params.action || "data").toLowerCase();

  if (action === "data") {
    return jsonResponse_({ ok: true, places: readPlaces_() });
  }

  if (action === "add") {
    return jsonResponse_(addPlaceRequest_(params.name, params.country));
  }

  return jsonResponse_({ ok: false, error: "Unknown action: " + action });
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readPlaces_() {
  const doc = getDoc();
  if (!doc) return [];

  const sheet = doc.getSheetByName(DB_SHEET_NAME) || doc.getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  return values.slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return String(cell || "").trim() !== "";
      });
    })
    .map(function (row) {
      const place = {};
      headers.forEach(function (header, index) {
        if (header) place[header] = row[index];
      });
      return place;
    })
    .filter(function (place) {
      return place.Country;
    });
}

function addPlaceRequest_(name, country) {
  if (!name || !country) {
    return { ok: false, error: "name and country are required" };
  }

  const cleanName = String(name).trim();
  const cleanCountry = String(country).trim();
  const doc = getDoc();
  if (!doc) {
    return { ok: false, error: "Spreadsheet not found. Check SPREADSHEET_ID." };
  }

  const dbSheet = getOrCreateSheet(doc, DB_SHEET_NAME);
  const candSheet = getOrCreateSheet(doc, CANDIDATES_SHEET_NAME, CANDIDATE_HEADERS);

  const existingNames = dbSheet.getRange("B:B").getValues().flat()
    .filter(String)
    .map(function (n) { return String(n).toLowerCase(); });

  const pendingNames = candSheet.getRange("C:C").getValues().flat()
    .filter(String)
    .map(function (n) { return String(n).toLowerCase(); });

  if (existingNames.indexOf(cleanName.toLowerCase()) !== -1) {
    return { ok: false, error: "Already exists in database" };
  }

  if (pendingNames.indexOf(cleanName.toLowerCase()) !== -1) {
    return { ok: true, message: "Already queued for review", name: cleanName, country: cleanCountry };
  }

  candSheet.appendRow(["Pending", cleanCountry, cleanName, "", "", "", "", "", ""]);
  return {
    ok: true,
    message: "Added to Candidates for Amina review",
    name: cleanName,
    country: cleanCountry
  };
}

// ==========================================
// 🔧 Helpers
// ==========================================

function getGroqApiKey_() {
  const stored = PropertiesService.getScriptProperties().getProperty("GROQ_API_KEY");
  if (stored) return stored;
  if (GROQ_API_KEY && GROQ_API_KEY.length > 10) return GROQ_API_KEY;
  throw new Error("Groq API key missing. Set Script Property GROQ_API_KEY or GROQ_API_KEY constant.");
}

function setGroqApiKeyOnce() {
  // ⚠️ 본인 키를 아래에 넣고 이 함수를 1회 실행한 뒤, 키 문자열은 삭제하세요.
  PropertiesService.getScriptProperties().setProperty("GROQ_API_KEY", "PASTE_YOUR_GROQ_KEY_HERE");
}

function getDoc() {
  const cleanID = String(SPREADSHEET_ID || "").trim();
  console.log("📂 Opening spreadsheet ID: [" + cleanID + "]");

  try {
    if (cleanID && cleanID.length > 20) {
      return SpreadsheetApp.openById(cleanID);
    }
    console.log("⚠️ SPREADSHEET_ID empty. Using active spreadsheet.");
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    console.error("❌ Failed to open spreadsheet: " + e.message);
    return null;
  }
}

function getOrCreateSheet(doc, name, headers) {
  if (!doc) throw new Error("Spreadsheet not found. Check SPREADSHEET_ID.");
  let sheet = doc.getSheetByName(name);
  if (!sheet) {
    sheet = doc.insertSheet(name);
    if (headers) sheet.appendRow(headers);
  }
  return sheet;
}

function isChatModel_(modelId) {
  if (!modelId || EXCLUDED_MODEL_PATTERNS.some(function (pattern) { return pattern.test(modelId); })) {
    return false;
  }
  return /llama|gpt-oss|qwen|mixtral|gemma|deepseek|kimi|maverick|scout/i.test(modelId);
}

function getAvailableGroqModels_() {
  try {
    const response = UrlFetchApp.fetch("https://api.groq.com/openai/v1/models", {
      method: "get",
      headers: {
        Authorization: "Bearer " + getGroqApiKey_(),
        "Content-Type": "application/json"
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      return FALLBACK_GROQ_MODELS.slice();
    }

    const data = JSON.parse(response.getContentText());
    const models = (data.data || [])
      .map(function (item) { return item.id; })
      .filter(isChatModel_);

    return models.length ? models : FALLBACK_GROQ_MODELS.slice();
  } catch (e) {
    console.warn("Model discovery failed, using fallback list: " + e.message);
    return FALLBACK_GROQ_MODELS.slice();
  }
}

function pickGroqModel_() {
  const models = getAvailableGroqModels_();
  return models[Math.floor(Math.random() * models.length)];
}

function callGroqChat_(messages, options) {
  options = options || {};
  const models = getAvailableGroqModels_();
  const primary = pickGroqModel_();
  const tryModels = [primary].concat(
    models.filter(function (model) { return model !== primary; })
  );

  let lastError = "Groq API call failed";

  for (var i = 0; i < tryModels.length; i++) {
    const model = tryModels[i];
    const payload = {
      model: model,
      messages: messages,
      temperature: options.temperature != null ? options.temperature : 0.3
    };

    if (options.responseFormat) {
      payload.response_format = options.responseFormat;
    }

    const response = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "post",
      headers: {
        Authorization: "Bearer " + getGroqApiKey_(),
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code === 200) {
      const json = JSON.parse(response.getContentText());
      return {
        ok: true,
        model: model,
        content: json.choices[0].message.content
      };
    }

    lastError = model + ": " + response.getContentText();
    console.error("Groq API error: " + lastError);
  }

  return { ok: false, error: lastError };
}

function extractJsonArray_(text) {
  const match = String(text || "").match(/\[[\s\S]*\]/);
  return match ? match[0] : text;
}

function extractJsonObject_(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

// ==========================================
// 1. 채굴 함수 (minePlaces)
// ==========================================

function minePlaces(location) {
  const doc = getDoc();
  const dbSheet = getOrCreateSheet(doc, DB_SHEET_NAME);
  const candSheet = getOrCreateSheet(doc, CANDIDATES_SHEET_NAME, CANDIDATE_HEADERS);

  const existingNames = dbSheet.getRange("B:B").getValues().flat()
    .filter(String)
    .map(function (n) { return String(n).toLowerCase(); });

  const pendingNames = candSheet.getRange("C:C").getValues().flat()
    .filter(String)
    .map(function (n) { return String(n).toLowerCase(); });

  const allNames = existingNames.concat(pendingNames);

  const prompt = [
    "Task: Find 3 REAL, POPULAR Halal/Muslim-friendly restaurants in \"" + location + "\".",
    "Constraints:",
    "1. Return ONLY a JSON Array. No intro/outro text.",
    "2. Exclude: " + allNames.slice(0, 10).join(", ") + ".",
    "",
    "Format:",
    "[",
    "  {",
    "    \"name\": \"English Name\",",
    "    \"category\": \"Food Category\",",
    "    \"label\": \"Halal Certified\",",
    "    \"desc\": \"Short description\",",
    "    \"address\": \"Address\",",
    "    \"lat\": 37.5,",
    "    \"lon\": 127.0",
    "  }",
    "]"
  ].join("\n");

  try {
    const result = callGroqChat_(
      [{ role: "user", content: prompt }],
      { temperature: 0.5 }
    );

    if (!result.ok) {
      console.error("🚨 API call failed: " + result.error);
      return;
    }

    const places = JSON.parse(extractJsonArray_(result.content));
    const newRows = [];

    if (Array.isArray(places)) {
      places.forEach(function (p) {
        if (p.name && allNames.indexOf(String(p.name).toLowerCase()) === -1) {
          newRows.push([
            "Pending",
            location,
            p.name,
            p.category || "",
            p.label || "",
            p.desc || "",
            p.address || "",
            p.lat || "",
            p.lon || ""
          ]);
        }
      });

      if (newRows.length > 0) {
        candSheet.getRange(candSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
        console.log("✅ Saved " + newRows.length + " places to Candidates.");
      } else {
        console.log("💨 Duplicate or empty result.");
      }
    }
  } catch (e) {
    console.error("💥 minePlaces error: " + e.toString());
  }
}

// ==========================================
// 2. AI 심사관 (consultAmina)
// ==========================================

function consultAmina(name, country) {
  const prompt = [
    "Role: Strict Halal Auditor & Data Entry Clerk.",
    "Task: Investigate \"" + name + "\" in \"" + country + "\".",
    "",
    "[Decision Rules]",
    "1. REJECT if: Serves Pork (Bacon/Ham/Lard/Samgyeopsal), Gambling place, Club, or Nightlife Bar.",
    "2. APPROVE if: Halal Certified, Pork-Free, Seafood, Vegan, Bakery (No Lard), or Muslim Friendly Restaurant.",
    "3. If unsure, assume general restaurant and check menu.",
    "",
    "[Output Format - JSON ONLY]",
    "{",
    "  \"verdict\": \"APPROVED\" or \"REJECTED\",",
    "  \"reason\": \"Short reason (Max 10 words)\",",
    "  \"name_en\": \"Official English Name\",",
    "  \"name_ko\": \"Official Korean Name (or Local Name)\",",
    "  \"lat\": 0.0,",
    "  \"lon\": 0.0,",
    "  \"category\": \"Choose one: Asian, Western, Middle East, Korean, Cafe\",",
    "  \"label\": \"Choose one: Halal Certified, Muslim Friendly, Seafood Only, Vegan, No Pork\",",
    "  \"desc_ko\": \"Short 1 sentence description in Korean.\",",
    "  \"desc_en\": \"Short 1 sentence description in English.\",",
    "  \"address\": \"Full Address\"",
    "}"
  ].join("\n");

  try {
    const result = callGroqChat_(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, responseFormat: { type: "json_object" } }
    );

    if (!result.ok) {
      console.error("AI call failed: " + result.error);
      return { verdict: "REJECTED", reason: "AI API Error" };
    }

    return JSON.parse(extractJsonObject_(result.content));
  } catch (e) {
    console.error("consultAmina error: " + e.toString());
    return { verdict: "REJECTED", reason: "Script Error" };
  }
}

// ==========================================
// 3. Auto Auditor (후보군 자동 심사 & 등록)
// ==========================================

function autoReviewCandidates() {
  const doc = getDoc();
  const candSheet = doc.getSheetByName(CANDIDATES_SHEET_NAME);
  const dbSheet = doc.getSheetByName(DB_SHEET_NAME);

  if (!candSheet || !dbSheet) {
    console.error("❌ Missing Candidates or Sheet1.");
    return;
  }

  const lastRow = candSheet.getLastRow();
  if (lastRow < 2) {
    console.log("💤 No candidates to review.");
    return;
  }

  const range = candSheet.getRange(2, 1, lastRow - 1, 9);
  const values = range.getValues();
  let processCount = 0;
  const LIMIT = 5;

  for (let i = 0; i < values.length; i++) {
    if (processCount >= LIMIT) break;

    if (values[i][0] === "Pending") {
      const country = values[i][1];
      const name = values[i][2];

      console.log("🧐 Reviewing: " + name + " (" + country + ")");

      const dbNames = dbSheet.getRange("B:B").getValues().flat().filter(String);
      const isDuplicate = dbNames.indexOf(name) !== -1;

      if (isDuplicate) {
        values[i][0] = "Duplicate";
        console.log("  -> Duplicate");
      } else {
        const aiResult = consultAmina(name, country);

        if (aiResult.verdict === "APPROVED") {
          dbSheet.appendRow([
            country,
            aiResult.name_en || name,
            aiResult.name_ko || "",
            aiResult.lat || "",
            aiResult.lon || "",
            aiResult.category || values[i][3] || "",
            aiResult.label || values[i][4] || "",
            aiResult.desc_ko || values[i][5] || "",
            aiResult.desc_en || aiResult.desc_ko || values[i][5] || "",
            aiResult.address || values[i][6] || ""
          ]);
          values[i][0] = "Approved";
          console.log("  -> 🎉 Approved and added to Sheet1");
        } else {
          values[i][0] = "Rejected";
          console.log("  -> ❌ Rejected: " + (aiResult.reason || "Unknown"));
        }
      }

      processCount++;
    }
  }

  if (processCount > 0) {
    range.setValues(values);
    console.log("✅ Reviewed " + processCount + " candidates.");
  } else {
    console.log("💤 No Pending candidates.");
  }
}

// ==========================================
// 4. Triggers & Tests
// ==========================================

function setupAuditorTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoReviewCandidates") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("autoReviewCandidates")
    .timeBased()
    .everyHours(3)
    .create();

  console.log("⏰ autoReviewCandidates trigger created (every 3 hours).");
}

function TEST_FORCE_MINING() {
  console.log("🧪 Force mining started...");
  minePlaces("Seoul, Korea");
}

function TEST_WEB_DATA() {
  const places = readPlaces_();
  console.log("Places loaded: " + places.length);
}

function TEST_WEB_ADD() {
  const result = addPlaceRequest_("Test Halal Cafe", "Korea");
  console.log(JSON.stringify(result));
}
