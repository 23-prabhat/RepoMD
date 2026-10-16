const OPENCODE_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";
const DEFAULT_OPENCODE_MODEL = "deepseek-v4.1-flash";

export type OpenCodeMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface OpenCodeCompletionOptions {
  messages: OpenCodeMessage[];
  temperature: number;
  maxTokens: number;
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
}

interface OpenCodeResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

export class OpenCodeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "OpenCodeRequestError";
  }
}

function getApiKey(): string {
  const apiKey = process.env.OPENCODE_API_KEY?.trim() || process.env.OPENCODE_ZEN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("The primary AI provider is not configured");
  }
  return apiKey;
}

export function isOpenCodeConfigured(): boolean {
  return Boolean(process.env.OPENCODE_API_KEY?.trim() || process.env.OPENCODE_ZEN_API_KEY?.trim());
}

function readContent(response: OpenCodeResponse): string | undefined {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    return text || undefined;
  }
  return undefined;
}

export async function completeWithOpenCode(options: OpenCodeCompletionOptions): Promise<string> {
  const response = await fetch(OPENCODE_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENCODE_MODEL?.trim() || DEFAULT_OPENCODE_MODEL,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: false,
      ...(options.jsonSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: options.jsonSchema.name,
                strict: true,
                schema: options.jsonSchema.schema,
              },
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  let data: OpenCodeResponse;
  try {
    data = (await response.json()) as OpenCodeResponse;
  } catch {
    throw new OpenCodeRequestError("The primary AI provider returned an invalid response", response.status);
  }

  if (!response.ok) {
    throw new OpenCodeRequestError(
      data.error?.message || `The primary AI provider request failed with status ${response.status}`,
      response.status
    );
  }

  const text = readContent(data);
  if (!text) {
    throw new OpenCodeRequestError("The primary AI provider returned an empty response", response.status);
  }

  return text;
}
