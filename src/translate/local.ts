import {
	TRANSLATE_SYSTEM,
	buildTranslatePrompt,
	parseTranslateResponse,
} from "./common.js";

export async function chatLocal(
	systemMsg: string,
	userMsg: string,
	ollamaUrl: string,
	model: string,
): Promise<string> {
	const res = await fetch(`${ollamaUrl}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: systemMsg },
				{ role: "user", content: userMsg },
			],
			stream: false,
			options: { temperature: 0.3, num_ctx: 4096 },
		}),
	});

	if (!res.ok) {
		throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
	}

	const data = (await res.json()) as { message: { content: string } };
	return data.message.content;
}

export async function translateBatchLocal(
	texts: string[],
	ollamaUrl: string,
	model: string,
): Promise<string[]> {
	const content = await chatLocal(
		TRANSLATE_SYSTEM,
		buildTranslatePrompt(texts),
		ollamaUrl,
		model,
	);
	return parseTranslateResponse(content, texts.length);
}
