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

export type BaseBlock = {
  time: string; // ISO string
  file: string;
  workType?: WorkType;
  mainGoal?: string;
  changeSummary?: string;
  importantFunctions?: string[];
  risks?: string;
  nextSteps?: string;
  codeSnippet?: string;
};

export type ConceptInfo = {
  name: string;
  whatItIs: string;
  whyRelevantHere: string;
  pitfalls: string[];
};

export type AlternativeInfo = {
  name: string;
  pros: string[];
  cons: string[];
};

export type ReasoningBlock = {
  time: string;
  file: string;
  oneLineSummary: string;
  problem: string;
  behavior: string[];
  concepts: ConceptInfo[];
  alternatives: AlternativeInfo[];
  whyChosen: string[];
  tradeoffs: string[];
  rememberThis: string[];
};

export type ReasoningJson = {
  blocks: ReasoningBlock[];
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

const REPORT_REASONING_PROMPT = [
  "당신은 시니어 소프트웨어 엔지니어이자 기술 교육자입니다.",
  "",
  "당신에게 전달되는 것은 BaseBlock 배열입니다.",
  "BaseBlock에는 다음과 같은 \"사실 정보\"만 들어 있습니다:",
  "- 파일명",
  "- 타임스탬프",
  "- workType (feature/refactor/bugfix/test/chore)",
  "- mainGoal",
  "- changeSummary",
  "- importantFunctions",
  "- risks",
  "- nextSteps",
  "- codeSnippet(부분 코드가 들어올 수 있음)",
  "",
  "당신의 작업:",
  "각 BaseBlock을 기반으로 개발자의 생각, 선택 배경, 기술적 개념, 대안 비교, 트레이드오프를 확장한",
  "\"학습지용 회고 JSON\"을 생성하는 것입니다.",
  "자연어 문단을 직접 작성하지 말고, 아래 JSON 형식만 출력하세요.",
  "",
  "각 블록에서 분석해야 할 항목:",
  "1. 개발자가 이 시점에서 달성하려고 한 목표(의도).",
  "2. 변경 전 어떤 문제가 있었는지.",
  "3. 현재 선택한 해결 방식이 합리적인 이유.",
  "4. 가능한 대안 2~3개와 각각의 장점/단점.",
  "5. 여러 대안 중 해당 방식을 선택한 이유(추론 가능).",
  "6. 해당 코드/파일에서 자연스럽게 등장하는 핵심 개념(예: 한글 유니코드 조합, PyQt 이벤트 루프, GUI 아키텍처, diff 기반 로깅 등).",
  "7. 각 개념에 대해:",
  "   - 개념 설명",
  "   - 이 상황에서 왜 중요한지",
  "   - 초보자가 흔히 겪는 실수 또는 함정",
  "8. 이 변경으로 인해 생긴 트레이드오프(위험/손실/절충점).",
  "9. 이후 비슷한 작업을 할 때 기억하면 좋은 ‘다음번을 위한 팁’.",
  "",
  "출력 JSON 형식:",
  "{",
  "  \"blocks\": [",
  "    {",
  "      \"time\": \"...\",",
  "      \"file\": \"...\",",
  "      \"oneLineSummary\": \"...\",",
  "      \"problem\": \"...\",",
  "      \"behavior\": [...],",
  "      \"concepts\": [",
  "        {",
  "          \"name\": \"...\",",
  "          \"whatItIs\": \"...\",",
  "          \"whyRelevantHere\": \"...\",",
  "          \"pitfalls\": [...]",
  "        }",
  "      ],",
  "      \"alternatives\": [",
  "        {",
  "          \"name\": \"...\",",
  "          \"pros\": [...],",
  "          \"cons\": [...]",
  "        }",
  "      ],",
  "      \"whyChosen\": [...],",
  "      \"tradeoffs\": [...],",
  "      \"rememberThis\": [...]",
  "    }",
  "  ]",
  "}",
  "",
  "규칙:",
  "- 모든 텍스트는 한국어로 작성합니다 (영어 표현이 들어가지 않도록 합니다).",
  "- 각 항목은 충분히 길고 친절하게, 학습자가 바로 이해할 수 있게 구체적으로 적습니다.",
  "- 번호/리스트를 활용해 구조를 명확히 하고, 가능하면 2~3개 이상의 세부 bullet을 넣습니다.",
  "- 근거가 충분하면 추론을 사용해도 좋습니다.",
  "- 불필요하게 과장하거나 장황하게 적지 말고, 학습자 중심으로 가치 있는 정보만 넣으세요.",
  "- BaseBlock에 없는 내용은 지어내지 말되, 상황상 자연스러운 추론은 허용됩니다."
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

/**
 * Generates reasoning JSON (single LLM call) from BaseBlock timeline.
 */
export async function generateReportReasoning(
  provider: AiProvider,
  apiKey: string,
  model: string,
  baseBlocks: BaseBlock[]
): Promise<ReasoningJson> {
  const userPrompt = JSON.stringify({ blocks: baseBlocks }, null, 2);

  switch (provider) {
    case "openai": {
      const content = await callOpenAiText(apiKey, model || "gpt-4o", REPORT_REASONING_PROMPT, userPrompt);
      return parseReasoningJson(content);
    }
    case "gemini": {
      const modelName = model || "gemini-1.5-pro";
      const body = {
        contents: [
          {
            role: "user",
            parts: [{ text: `${REPORT_REASONING_PROMPT}\n\n${userPrompt}` }]
          }
        ]
      };
      const response = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        { "Content-Type": "application/json" },
        body
      );
      const content = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return parseReasoningJson(content);
    }
    case "deepseek": {
      const content = await callDeepSeekText(apiKey, model || "deepseek-chat", REPORT_REASONING_PROMPT, userPrompt);
      return parseReasoningJson(content);
    }
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

function parseReasoningJson(content: unknown): ReasoningJson {
  if (typeof content !== "string") {
    throw new Error("AI response was empty.");
  }

  const parsed = safeParseJson(content);
  const blocks = Array.isArray(parsed) ? parsed : parsed?.blocks;
  if (!Array.isArray(blocks)) {
    throw new Error("Reasoning JSON schema mismatch.");
  }

  const validBlocks = blocks
    .map((block) => ({
      time: block.time,
      file: block.file,
      oneLineSummary: block.oneLineSummary,
      problem: block.problem,
      behavior: Array.isArray(block.behavior) ? block.behavior : [],
      concepts: Array.isArray(block.concepts) ? block.concepts : [],
      alternatives: Array.isArray(block.alternatives) ? block.alternatives : [],
      whyChosen: Array.isArray(block.whyChosen) ? block.whyChosen : [],
      tradeoffs: Array.isArray(block.tradeoffs) ? block.tradeoffs : [],
      rememberThis: Array.isArray(block.rememberThis) ? block.rememberThis : []
    }))
    .filter((block) =>
      typeof block.time === "string" &&
      typeof block.oneLineSummary === "string" &&
      typeof block.problem === "string"
    );

  if (validBlocks.length === 0) {
    throw new Error("No valid reasoning blocks found in AI response.");
  }

  return { blocks: validBlocks };
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

function safeParseJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    const trimmed = content.trim();
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd !== -1) {
      const jsonText = trimmed.slice(objectStart, objectEnd + 1);
      return JSON.parse(jsonText);
    }

    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1) {
      const jsonText = trimmed.slice(arrayStart, arrayEnd + 1);
      return JSON.parse(jsonText);
    }

    throw new Error("AI response did not include JSON.");
  }
}

async function callOpenAiText(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
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

  return response?.choices?.[0]?.message?.content ?? "";
}

async function callDeepSeekText(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
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

  return response?.choices?.[0]?.message?.content ?? "";
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
