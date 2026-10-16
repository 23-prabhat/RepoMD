const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"];

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface GeminiGenerateOptions {
  prompt: string;
  systemInstruction: string;
  temperature: number;
  maxOutputTokens: number;
  responseJsonSchema?: object;
}

function getGeminiModels(): string[] {
  const configuredModels = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL;

  if (!configuredModels) return DEFAULT_GEMINI_MODELS;

  const models = configuredModels
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models.length > 0 ? models : DEFAULT_GEMINI_MODELS;
}

async function generateWithGeminiModel(
  model: string,
  apiKey: string,
  options: GeminiGenerateOptions
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
  };

  if (options.responseJsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = options.responseJsonSchema;
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        generationConfig,
      }),
    }
  );

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(
      `Gemini API failed (${response.status}): ${data.error?.message || response.statusText}`
    );
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

export async function generateWithGemini({
  prompt,
  systemInstruction,
  temperature,
  maxOutputTokens,
  responseJsonSchema,
}: GeminiGenerateOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const options = {
    prompt,
    systemInstruction,
    temperature,
    maxOutputTokens,
    responseJsonSchema,
  };
  let lastError: unknown;

  for (const model of getGeminiModels()) {
    try {
      return await generateWithGeminiModel(model, apiKey, options);
    } catch (error) {
      lastError = error;
      console.warn(`[ai] Gemini model ${model} failed; trying next fallback`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All configured Gemini models failed");
}
