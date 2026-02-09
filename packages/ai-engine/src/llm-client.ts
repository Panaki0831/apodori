import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  type LlmRequest,
  type LlmResponse,
  retryWithBackoff,
} from "@sales-ai/core";

export interface LlmClientConfig {
  claudeApiKey: string;
  openaiApiKey: string;
  /** Default timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Maximum number of retries on transient failures (default: 3) */
  maxRetries?: number;
}

export class LlmClient {
  private readonly claude: Anthropic;
  private readonly openai: OpenAI;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: LlmClientConfig) {
    this.claude = new Anthropic({ apiKey: config.claudeApiKey });
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Send a request to the configured LLM provider.
   * Automatically routes to Claude or OpenAI based on `request.provider`.
   */
  async call(request: LlmRequest): Promise<LlmResponse> {
    return retryWithBackoff(
      () => this.dispatch(request),
      this.maxRetries,
      1000,
    );
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  private async dispatch(request: LlmRequest): Promise<LlmResponse> {
    switch (request.provider) {
      case "claude":
        return this.callClaude(request);
      case "openai":
        return this.callOpenAI(request);
      default: {
        const _exhaustive: never = request.provider;
        throw new Error(`Unknown LLM provider: ${_exhaustive}`);
      }
    }
  }

  private async callClaude(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.claude.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const content = textBlock?.type === "text" ? textBlock.text : "";

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async callOpenAI(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.openai.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
    });

    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";

    return {
      content,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}
