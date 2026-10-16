import Groq from "groq-sdk";
import type { AnalysisResult } from "@/lib/types";
import { generateWithGemini } from "@/lib/gemini";

export const dynamic = "force-dynamic";

const GROQ_MODEL = "openai/gpt-oss-120b";

interface ChatRequest {
  message: string;
  repoFullName: string;
  analysis: AnalysisResult;
}

async function chatWithGroq(systemPrompt: string, message: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
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
    throw new Error("Groq returned an empty chat response");
  }

  return text;
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

    let text: string;
    try {
      text = await chatWithGroq(systemPrompt, message);
    } catch (error) {
      console.warn("[ai] Groq chat failed; trying Gemini fallback", error);
      text = await generateWithGemini({
        systemInstruction: systemPrompt,
        prompt: message,
        temperature: 0.7,
        maxOutputTokens: 800,
      });
    }

    return Response.json({ reply: text });
  } catch {
    return Response.json(
      { reply: "Sorry, I couldn't process that. Please try again." },
      { status: 500 }
    );
  }
}
