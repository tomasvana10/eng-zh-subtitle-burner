import {
	TRANSLATE_SYSTEM,
	buildTranslatePrompt,
	parseTranslateResponse,
} from "./common.js";

export async function translateBatchClaude(
	texts: string[],
	apiKey: string,
	model: string,
): Promise<string[]> {
	const Anthropic = (await import("@anthropic-ai/sdk")).default;
	const client = new Anthropic({ apiKey });

	const msg = await client.messages.create({
		model,
		max_tokens: 4096,
		system: TRANSLATE_SYSTEM,
		messages: [{ role: "user", content: buildTranslatePrompt(texts) }],
	});

	const content = msg.content
		.filter((b) => b.type === "text")
		.map((b) => b.text)
		.join("\n");
	return parseTranslateResponse(content, texts.length);
}
