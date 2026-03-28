import {
	TRANSLATE_SYSTEM,
	buildTranslatePrompt,
	parseTranslateResponse,
} from "./common.js";

export async function translateBatchGemini(
	texts: string[],
	apiKey: string,
	model: string,
): Promise<string[]> {
	const { GoogleGenerativeAI } = await import("@google/generative-ai");
	const genAI = new GoogleGenerativeAI(apiKey);
	const genModel = genAI.getGenerativeModel({ model });

	const result = await genModel.generateContent({
		systemInstruction: TRANSLATE_SYSTEM,
		contents: [
			{
				role: "user",
				parts: [{ text: buildTranslatePrompt(texts) }],
			},
		],
		generationConfig: { temperature: 0.3 },
	});

	const content = result.response.text();
	return parseTranslateResponse(content, texts.length);
}
