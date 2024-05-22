"use server";

import { generateText, streamText } from "ai";
import { createStreamableValue } from "ai/rsc";
import { createOpenAI } from "@ai-sdk/openai";
import { ServerConfigs } from "@/lib/db";

export async function getAnswer(question: string) {
    // get openaikey from db
    const serverConfig = await ServerConfigs.findOne({});
    const openaiKey = serverConfig?.openaiKey;
    if (!openaiKey) {
        throw new Error("OpenAI key not found");
    }

    let openAiProvider = createOpenAI({ apiKey: openaiKey });

    let { text, finishReason, usage } = await generateText({
        model: openAiProvider("gpt-4o"),
        prompt: question,
    });
    //text = JSON.stringify({ text, finishReason, usage });
    return { text, finishReason, usage };
}

export async function getStreamedAnswer(question: string) {
    // get openaikey from db
    const serverConfig = await ServerConfigs.findOne({});
    const openaiKey = serverConfig?.openaiKey;
    if (!openaiKey) {
        throw new Error("OpenAI key not found");
    }

    let openAiProvider = createOpenAI({ apiKey: openaiKey });
    const stream = createStreamableValue("");

    (async () => {
        const { textStream } = await streamText({
            model: openAiProvider("gpt-4o"),
            prompt: question,
        });

        for await (const delta of textStream) {
            stream.update(delta);
        }
        stream.done();
    })();

    return { output: stream.value };
}
