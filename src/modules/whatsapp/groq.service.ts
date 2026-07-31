import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface GroqTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface GroqChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: GroqToolCall[];
  };
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

export interface GroqResponse {
  id: string;
  choices: GroqChoice[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.groq.com/openai/v1';
  private readonly defaultModel = 'llama-3.3-70b-versatile';

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('groq.apiKey') || '';
    if (!this.apiKey) {
      this.logger.warn('GROQ_API_KEY não configurada');
    }
  }

  private async request(
    messages: GroqMessage[],
    tools?: GroqTool[],
    model?: string,
    maxTokens = 1024,
  ): Promise<GroqResponse> {
    const body: Record<string, unknown> = {
      model: model || this.defaultModel,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const inicio = Date.now();
    const url = `${this.baseUrl}/chat/completions`;
    this.logger.log(`[GROQ] POST ${url} | modelo=${model || this.defaultModel} | messages=${messages.length} | tools=${tools?.length || 0}`);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      this.logger.error(`[GROQ] ERRO de rede ao chamar API: ${err.message}`);
      throw err;
    }

    this.logger.log(`[GROQ] HTTP ${res.status} em ${Date.now() - inicio}ms`);

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`[GROQ] API error (${res.status}): ${text}`);
      throw new Error(`Groq API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    this.logger.log(`[GROQ] resposta ok | finish_reason=${choice?.finish_reason} | tokens=${data.usage?.total_tokens} | tool_calls=${choice?.message?.tool_calls?.length || 0}`);
    return data;
  }

  async chat(
    messages: GroqMessage[],
    tools?: GroqTool[],
    model?: string,
    maxTokens?: number,
  ): Promise<GroqResponse> {
    return this.request(messages, tools, model, maxTokens);
  }

  async chatWithToolCalls(
    systemPrompt: string,
    conversation: { role: 'user' | 'assistant'; content: string }[],
    tools: GroqTool[],
    model?: string,
  ): Promise<{ content: string | null; toolCalls: GroqToolCall[]; tokens: number }> {
    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversation.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const response = await this.request(messages, tools, model);
    const choice = response.choices[0];

    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls || [],
      tokens: response.usage.total_tokens,
    };
  }

  async generateResponse(
    systemPrompt: string,
    conversation: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
    tools: GroqTool[],
    model?: string,
  ): Promise<{
    content: string | null;
    toolCalls: GroqToolCall[];
    tokens: number;
  }> {
    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversation.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await this.request(messages, tools, model);
    const choice = response.choices[0];

    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls || [],
      tokens: response.usage.total_tokens,
    };
  }
}
