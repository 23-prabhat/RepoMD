function endpoint(baseUrl, path) {
    return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
function connectionMessage(baseUrl) {
    return new Error(`Could not reach RepoMD at ${baseUrl}. Start the web app with \`cd web && pnpm dev\` or set REPOMD_API_URL.`);
}
export async function analyzeRepository(baseUrl, repositoryUrl, onProgress) {
    let response;
    try {
        response = await fetch(endpoint(baseUrl, "/api/analyze"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: repositoryUrl }),
        });
    }
    catch {
        throw connectionMessage(baseUrl);
    }
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Analysis request failed (${response.status}).`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
        const body = await response.json();
        if (!body.ok)
            throw new Error(body.error || "Analysis failed.");
        return body;
    }
    if (!response.body)
        throw new Error("The analysis response had no body.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
            const line = block.split("\n").find((item) => item.startsWith("data: "));
            if (!line)
                continue;
            const event = JSON.parse(line.slice(6));
            onProgress(event);
            if (event.stage === "error")
                throw new Error(event.error || "Analysis failed.");
            if (event.stage === "done" && event.data)
                return event.data;
        }
        if (done)
            break;
    }
    throw new Error("The analysis stream ended before returning a result.");
}
export async function askRepository(baseUrl, repoFullName, analysis, message) {
    let response;
    try {
        response = await fetch(endpoint(baseUrl, "/api/chat"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, repoFullName, analysis }),
        });
    }
    catch {
        throw connectionMessage(baseUrl);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.reply) {
        throw new Error(body?.reply || "RepoMD could not answer that question.");
    }
    return body.reply;
}
//# sourceMappingURL=api.js.map