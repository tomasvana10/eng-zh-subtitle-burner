import {
	TRANSLATE_SYSTEM,
	buildTranslatePrompt,
	parseTranslateResponse,
} from "./common.js";

export async function translateBatchChatgpt(
	texts: string[],
	apiKey: string,
	model: string,
): Promise<string[]> {
	const OpenAI = (await import("openai")).default;
	const client = new OpenAI({ apiKey });

	const res = await client.chat.completions.create({
		model,
		temperature: 0.3,
		messages: [
			{ role: "system", content: TRANSLATE_SYSTEM },
			{ role: "user", content: buildTranslatePrompt(texts) },
		],
	});

	const content = res.choices[0]?.message?.content ?? "";
	return parseTranslateResponse(content, texts.length);
}
