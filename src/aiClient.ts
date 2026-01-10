import * as https from "https";

export type AiProvider = "none" | "openai" | "gemini" | "deepseek";

export type WorkType = "feature" | "refactor" | "bugfix" | "test" | "chore";

export type AiNotePayload = {
  workType: WorkType;
  mainGoal: string;
  changeSummary: string;
  importantFunctions: string[];
  risks?: string;
  nextSteps?: string;
};

export type AiNoteRequest = {
  workType: WorkType;
  filePath: string;
  languageId: string;
  userHint?: string;
  recentFileSaves: string[];
  diffSnippet: string;
};

const SYSTEM_PROMPT = [
  "너는 소스코드 diff와 메타정보를 기반으로 개발 변경을 요약하는 도우미다.",
  "다음 JSON 스키마에 맞는 객체 하나만 출력해라. JSON 외의 텍스트를 절대 쓰지 마라.",
  "Schema:",
  "{",
  "  \"workType\": \"feature\" | \"refactor\" | \"bugfix\" | \"test\" | \"chore\",",
  "  \"mainGoal\": string,",
  "  \"changeSummary\": string,",
  "  \"importantFunctions\": string[],",
  "  \"risks\": string (optional),",
  "  \"nextSteps\": string (optional)",
  "}",
  "항상 위 스키마의 키만 사용하고, JSON 객체 하나만 출력해라."
].join("\n");

/**
 * Calls the configured LLM provider to generate an AI note payload.
 */
export async function generateAiNote(
  provider: AiProvider,
  apiKey: string,
  model: string,
  request: AiNoteRequest
): Promise<AiNotePayload> {
  const prompt = buildUserPrompt(request);

  switch (provider) {
    case "openai":
      return callOpenAi(apiKey, model, prompt);
    case "gemini":
      return callGemini(apiKey, model, prompt);
    case "deepseek":
      return callDeepSeek(apiKey, model, prompt);
    default:
      throw new Error("Unsupported AI provider.");
  }
}

function buildUserPrompt(request: AiNoteRequest): string {
  const recentSaves = request.recentFileSaves.length
    ? request.recentFileSaves.join("\n")
    : "(no recent file_save events)";
  const hintLine = request.userHint?.trim() ? request.userHint.trim() : "(none)";

  // If workType is 'chore' (often default), instruct AI to infer it if possible
  const workTypeContext = request.workType === 'chore' 
    ? "workType: chore (please infer actual type if possible based on diff)" 
    : `workType: ${request.workType}`;

  return [
    workTypeContext,
    `filePath: ${request.filePath}`,
    `languageId: ${request.languageId}`,
    `userHint: ${hintLine}`,
    "recent file_save events:",
    recentSaves,
    "diff or snippet:",
    request.diffSnippet
  ].join("\n");
}

async function callOpenAi(apiKey: string, model: string, userPrompt: string): Promise<AiNotePayload> {
  const body = {
    model: model || "gpt-4o-mini", // Fallback
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  };

  const response = await postJson(
    "https://api.openai.com/v1/chat/completions",
    {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body
  );

  const content = response?.choices?.[0]?.message?.content;
  return parseAiNotePayload(content);
}

async function callGemini(apiKey: string, model: string, userPrompt: string): Promise<AiNotePayload> {
  const modelName = model || "gemini-1.5-flash"; // Fallback
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }]
      }
    ]
  };

  const response = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      "Content-Type": "application/json"
    },
    body
  );

  const content = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseAiNotePayload(content);
}

async function callDeepSeek(apiKey: string, model: string, userPrompt: string): Promise<AiNotePayload> {
  const body = {
    model: model || "deepseek-chat", // Fallback
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  };

  const response = await postJson(
    "https://api.deepseek.com/chat/completions",
    {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body
  );

  const content = response?.choices?.[0]?.message?.content;
  return parseAiNotePayload(content);
}

function parseAiNotePayload(content: unknown): AiNotePayload {
  if (typeof content !== "string") {
    throw new Error("AI response was empty.");
  }

  try {
    return JSON.parse(content) as AiNotePayload;
  } catch {
    const trimmed = content.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("AI response did not include JSON.");
    }
    const jsonText = trimmed.slice(start, end + 1);
    return JSON.parse(jsonText) as AiNotePayload;
  }
}

function postJson(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(JSON.stringify(payload))
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`AI request failed (${res.statusCode}): ${raw}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}
