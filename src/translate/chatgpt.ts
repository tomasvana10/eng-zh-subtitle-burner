import {
	buildTranslatePrompt,
	parseTranslateResponse,
	TRANSLATE_SYSTEM,
} from "./common.js";

export async function chatChatgpt(
	systemMsg: string,
	userMsg: string,
	apiKey: string,
	model: string,
): Promise<string> {
	const OpenAI = (await import("openai")).default;
	const client = new OpenAI({ apiKey });

	const res = await client.chat.completions.create({
		model,
		temperature: 0.3,
		messages: [
			{ role: "system", content: systemMsg },
			{ role: "user", content: userMsg },
		],
	});

	return res.choices[0]?.message?.content ?? "";
}

export async function translateBatchChatgpt(
	texts: string[],
	apiKey: string,
	model: string,
): Promise<string[]> {
	const content = await chatChatgpt(
		TRANSLATE_SYSTEM,
		buildTranslatePrompt(texts),
		apiKey,
		model,
	);
	return parseTranslateResponse(content, texts.length);
}
