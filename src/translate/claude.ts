import {
	buildTranslatePrompt,
	parseTranslateResponse,
	TRANSLATE_SYSTEM,
} from "./common.js";

export async function chatClaude(
	systemMsg: string,
	userMsg: string,
	apiKey: string,
	model: string,
): Promise<string> {
	const Anthropic = (await import("@anthropic-ai/sdk")).default;
	const client = new Anthropic({ apiKey });

	const msg = await client.messages.create({
		model,
		max_tokens: 4096,
		system: systemMsg,
		messages: [{ role: "user", content: userMsg }],
	});

	return msg.content
		.filter((b) => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

export async function translateBatchClaude(
	texts: string[],
	apiKey: string,
	model: string,
): Promise<string[]> {
	const content = await chatClaude(
		TRANSLATE_SYSTEM,
		buildTranslatePrompt(texts),
		apiKey,
		model,
	);
	return parseTranslateResponse(content, texts.length);
}
