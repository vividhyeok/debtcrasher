import * as https from "https";
import { BaseEvent } from "./logging";

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

export type ReportBlock = {
  time: string;
  file?: string;
  title: string;
  summary: string;
  details: string[];
  risks?: string;
  nextSteps?: string;
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

const REPORT_BLOCK_PROMPT = [
  "너는 개발 로그를 기반으로 시간순 학습지 블록을 만드는 도우미다.",
  "반드시 JSON만 출력해라. JSON 외의 텍스트를 절대 쓰지 마라.",
  "스키마:",
  "{",
  "  \"blocks\": [",
  "    {",
  "      \"time\": \"HH:MM\",",
  "      \"file\": \"file/path.ext\" (optional),",
  "      \"title\": \"짧은 제목\",",
  "      \"summary\": \"한 문장 요약\",",
  "      \"details\": [\"핵심 행동/변경 요약\", \"의도 또는 배경\", \"리스크 또는 다음 단계\"],",
  "      \"risks\": \"optional string\",",
  "      \"nextSteps\": \"optional string\"",
  "    }",
  "  ]",
  "}",
  "시간은 로그 timestamp를 HH:MM 형식으로 변환한다.",
  "file이 명확하지 않으면 생략하거나 \"프로젝트\"로 둔다.",
  "blocks는 시간순으로 정렬한다."
].join("\n");

const REPORT_MARKDOWN_PROMPT = [
  "너는 개발 로그 타임라인 학습지를 작성하는 도우미다.",
  "아래 JSON blocks를 기반으로 한국어 Markdown만 출력해라.",
  "출력은 섹션 없이 시간순 타임라인 블록만 작성한다.",
  "summary와 details를 반영해 학습지 스타일의 문장을 만든다.",
  "첫 문장에서 title을 자연스럽게 녹여라.",
  "각 블록 형식:",
  "## 🕒 {time} – {file}",
  "한두 문장으로 당시 의도와 맥락을 설명한다.",
  "- 변경 요약: ...",
  "- 관련 함수: ... (없으면 생략 가능)",
  "- 리스크: ... (없으면 생략 가능)",
  "- 다음 단계: ... (없으면 생략 가능)",
  "블록 사이에는 빈 줄을 둔다.",
  "불필요한 머리말, 섹션 제목, 추가 설명을 쓰지 마라."
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
 * Generates report timeline blocks from structured events.
 */
export async function generateReportBlocks(
  provider: AiProvider,
  apiKey: string,
  model: string,
  events: BaseEvent[],
  chunkLabel: string
): Promise<ReportBlock[]> {
  const prompt = buildReportBlockPrompt(events, chunkLabel);

  switch (provider) {
    case "openai":
      return callOpenAiReportBlocks(apiKey, model, prompt);
    case "gemini":
      return callGeminiReportBlocks(apiKey, model, prompt);
    case "deepseek":
      return callDeepSeekReportBlocks(apiKey, model, prompt);
    default:
      throw new Error("Unsupported AI provider.");
  }
}

/**
 * Renders report blocks into timeline Markdown.
 */
export async function renderBlocksToMarkdown(
  provider: AiProvider,
  apiKey: string,
  model: string,
  blocks: ReportBlock[],
  includeHeader: boolean
): Promise<string> {
  const prompt = buildReportMarkdownPrompt(blocks, includeHeader);

  switch (provider) {
    case "openai":
      return callOpenAiMarkdown(apiKey, model, prompt);
    case "gemini":
      return callGeminiMarkdown(apiKey, model, prompt);
    case "deepseek":
      return callDeepSeekMarkdown(apiKey, model, prompt);
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

function buildReportBlockPrompt(events: BaseEvent[], chunkLabel: string): string {
  const eventLines = events.map(formatEventLine).join("\n");
  return [
    `chunk: ${chunkLabel}`,
    "events:",
    eventLines || "(no events)"
  ].join("\n");
}

function buildReportMarkdownPrompt(blocks: ReportBlock[], includeHeader: boolean): string {
  const payload = JSON.stringify({ blocks }, null, 2);
  const headerInstruction = includeHeader
    ? "출력 맨 위에 별도의 섹션 제목을 추가하지 마라."
    : "출력은 타임라인 블록만 작성한다.";

  return [
    headerInstruction,
    "",
    payload
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

async function callOpenAiReportBlocks(
  apiKey: string,
  model: string,
  userPrompt: string
): Promise<ReportBlock[]> {
  const content = await callOpenAiText(apiKey, model || "gpt-4o", REPORT_BLOCK_PROMPT, userPrompt);
  return parseReportBlocks(content);
}

async function callOpenAiMarkdown(
  apiKey: string,
  model: string,
  userPrompt: string
): Promise<string> {
  return callOpenAiText(apiKey, model || "gpt-4o", REPORT_MARKDOWN_PROMPT, userPrompt);
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

async function callGeminiReportBlocks(
  apiKey: string,
  model: string,
  userPrompt: string
): Promise<ReportBlock[]> {
  const modelName = model || "gemini-1.5-pro";
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${REPORT_BLOCK_PROMPT}\n\n${userPrompt}` }]
      }
    ]
  };

  const response = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    { "Content-Type": "application/json" },
    body
  );

  const content = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseReportBlocks(content);
}

async function callGeminiMarkdown(
  apiKey: string,
  model: string,
  userPrompt: string
): Promise<string> {
  const modelName = model || "gemini-1.5-pro";
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${REPORT_MARKDOWN_PROMPT}\n\n${userPrompt}` }]
      }
    ]
  };

  const response = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    { "Content-Type": "application/json" },
    body
  );

  return response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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

async function callDeepSeekReportBlocks(
  apiKey: string,
  model: string,
  userPrompt: string
): Promise<ReportBlock[]> {
  const content = await callDeepSeekText(apiKey, model || "deepseek-chat", REPORT_BLOCK_PROMPT, userPrompt);
  return parseReportBlocks(content);
}

async function callDeepSeekMarkdown(
  apiKey: string,
  model: string,
  userPrompt: string
): Promise<string> {
  return callDeepSeekText(apiKey, model || "deepseek-chat", REPORT_MARKDOWN_PROMPT, userPrompt);
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

function parseReportBlocks(content: unknown): ReportBlock[] {
  if (typeof content !== "string") {
    throw new Error("AI response was empty.");
  }

  const parsed = safeParseJson(content);
  const blocks = Array.isArray(parsed) ? parsed : parsed?.blocks;
  if (!Array.isArray(blocks)) {
    throw new Error("Report blocks JSON schema mismatch.");
  }

  const validBlocks = blocks.filter((block) => {
    return (
      block &&
      typeof block.time === "string" &&
      typeof block.title === "string" &&
      typeof block.summary === "string"
    );
  }) as ReportBlock[];

  if (validBlocks.length === 0) {
    throw new Error("No valid report blocks found in AI response.");
  }

  return validBlocks.map((block) => ({
    time: block.time,
    file: block.file,
    title: block.title,
    summary: block.summary,
    details: Array.isArray(block.details) ? block.details : [],
    risks: block.risks,
    nextSteps: block.nextSteps
  }));
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

function formatEventLine(event: BaseEvent): string {
  const base = `[${event.timestamp}] (${event.type})`;
  const filePart = event.filePath ? ` file=${event.filePath}` : "";
  const branchPart = event.branch ? ` branch=${event.branch}` : "";

  if (event.type === "file_save") {
    const fileSave = event as any;
    return `${base}${filePart} +${fileSave.addedLines}/-${fileSave.removedLines} language=${fileSave.languageId}${branchPart}`;
  }

  if (event.type === "decision") {
    const decision = event as any;
    return `${base}${filePart} note=${decision.note}${branchPart}`;
  }

  if (event.type === "bugfix") {
    const bugfix = event as any;
    return `${base}${filePart} note=${bugfix.note}${branchPart}`;
  }

  if (event.type === "ai_note") {
    const aiNote = event as any;
    const functions = Array.isArray(aiNote.importantFunctions)
      ? aiNote.importantFunctions.join(", ")
      : "";
    return `${base}${filePart} goal=${aiNote.mainGoal} summary=${aiNote.changeSummary} functions=${functions} risks=${aiNote.risks ?? ""} next=${aiNote.nextSteps ?? ""}${branchPart}`;
  }

  return `${base}${filePart}${branchPart}`;
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
