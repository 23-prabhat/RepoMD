import Groq from "groq-sdk";
import { completeWithOpenCode, isOpenCodeConfigured } from "@/lib/opencode";
import type { AnalysisResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const GROQ_MODEL = "openai/gpt-oss-120b";

interface ChatRequest {
  message: string;
  repoFullName: string;
  analysis: AnalysisResult;
}

async function chatWithGroq(systemPrompt: string, message: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("The fallback AI provider is not configured");
  }

  const response = await new Groq({ apiKey }).chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    temperature: 0.7,
    max_completion_tokens: 800,
  });

  const text = response.choices[0]?.message.content;
  if (!text) {
    throw new Error("The fallback AI provider returned an empty chat response");
  }

  return text;
}

async function chatWithFallback(systemPrompt: string, message: string): Promise<string> {
  if (isOpenCodeConfigured()) {
    try {
      return await completeWithOpenCode({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        maxTokens: 800,
      });
    } catch (error) {
      console.warn("[ai] Primary chat failed; using fallback", error);
    }
  }

  return chatWithGroq(systemPrompt, message);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ reply: "Sorry, I couldn't process that. Please try again." }, { status: 500 });
  }

  const { message, repoFullName, analysis } = body as ChatRequest;

  if (!message || !repoFullName || !analysis) {
    return Response.json({ reply: "Sorry, I couldn't process that. Please try again." }, { status: 400 });
  }

  try {
    const systemPrompt = `You are an expert software architect assistant helping developers understand the repository "${repoFullName}".

You have access to the following pre-analyzed data about the repo:
<ANALYSIS>
${JSON.stringify(analysis, null, 2)}
</ANALYSIS>

Answer the user's question concisely. If the answer can be found in the analysis data, use it.
If you refer to specific files, quote their paths. Keep responses under 200 words unless a longer answer is clearly needed. Do not hallucinate details not present in the analysis.`;

    const text = await chatWithFallback(systemPrompt, message);

    return Response.json({ reply: text });
  } catch {
    return Response.json(
      { reply: "Sorry, I couldn't process that. Please try again." },
      { status: 500 }
    );
  }
}
