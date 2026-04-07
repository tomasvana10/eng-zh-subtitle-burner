import {
	TRANSLATE_SYSTEM,
	buildTranslatePrompt,
	parseTranslateResponse,
} from "./common.js";

export async function chatGemini(
	systemMsg: string,
	userMsg: string,
	apiKey: string,
	model: string,
): Promise<string> {
	const { GoogleGenerativeAI } = await import("@google/generative-ai");
	const genAI = new GoogleGenerativeAI(apiKey);
	const genModel = genAI.getGenerativeModel({ model });

	const result = await genModel.generateContent({
		systemInstruction: systemMsg,
		contents: [
			{
				role: "user",
				parts: [{ text: userMsg }],
			},
		],
		generationConfig: { temperature: 0.3 },
	});

	return result.response.text();
}

export async function translateBatchGemini(
	texts: string[],
	apiKey: string,
	model: string,
): Promise<string[]> {
	const content = await chatGemini(
		TRANSLATE_SYSTEM,
		buildTranslatePrompt(texts),
		apiKey,
		model,
	);
	return parseTranslateResponse(content, texts.length);
}
