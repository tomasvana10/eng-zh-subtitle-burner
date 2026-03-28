import {
	TRANSLATE_SYSTEM,
	buildTranslatePrompt,
	parseTranslateResponse,
} from "./common.js";

export async function translateBatchLocal(
	texts: string[],
	ollamaUrl: string,
	model: string,
): Promise<string[]> {
	const prompt = buildTranslatePrompt(texts);

	const res = await fetch(`${ollamaUrl}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: TRANSLATE_SYSTEM },
				{ role: "user", content: prompt },
			],
			stream: false,
			options: { temperature: 0.3, num_ctx: 4096 },
		}),
	});

	if (!res.ok) {
		throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
	}

	const data = (await res.json()) as { message: { content: string } };
	return parseTranslateResponse(data.message.content, texts.length);
}
