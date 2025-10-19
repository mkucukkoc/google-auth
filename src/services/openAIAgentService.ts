import axios from 'axios';
import { logger } from '../utils/logger';

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: any;
}

export interface AgentMessageContent {
  type: string;
  text?: string;
  image_url?: string;
  [key: string]: any;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | AgentMessageContent[] | null;
}

export interface AgentExecutionOptions {
  requestId: string;
  model: string;
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  executeTool?: (name: string, args: any) => Promise<any>;
}

export interface AgentExecutedToolCall {
  id: string;
  name: string;
  arguments: any;
  result: any;
}

export interface AgentExecutionResult {
  outputText?: string;
  rawResponse: any;
  toolCalls: AgentExecutedToolCall[];
}

export class OpenAIAgentService {
  private static readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  private static readonly OPENAI_BASE_URL = 'https://api.openai.com/v1';

  private static get headers() {
    return {
      'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  private static ensureConfigured() {
    if (!this.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }
  }

  static async runAgent(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
    this.ensureConfigured();

    const payload = {
      model: options.model,
      input: this.transformMessages(options.messages),
      tools: this.transformTools(options.tools),
      tool_choice: 'auto'
    };

    logger.info({
      requestId: options.requestId,
      model: options.model,
      messageCount: options.messages.length,
      toolCount: options.tools.length,
      operation: 'openaiAgentRequest'
    }, 'Sending request to OpenAI responses API');

    let currentResponse: any;

    try {
      const response = await axios.post(`${this.OPENAI_BASE_URL}/responses`, payload, {
        headers: this.headers,
        timeout: 60000
      });

      currentResponse = response.data;
    } catch (error: any) {
      logger.error({
        requestId: options.requestId,
        model: options.model,
        error: error?.response?.data || error?.message,
        operation: 'openaiAgentRequest'
      }, 'OpenAI agent request failed');
      throw error;
    }

    const executedToolCalls: AgentExecutedToolCall[] = [];

    while (currentResponse?.required_action?.type === 'submit_tool_outputs') {
      const toolCalls = currentResponse.required_action?.submit_tool_outputs?.tool_calls || [];

      if (!options.executeTool) {
        logger.error({
          requestId: options.requestId,
          responseId: currentResponse?.id,
          toolCallCount: toolCalls.length,
          operation: 'openaiAgentToolCalls'
        }, 'Tool outputs required but no executeTool handler provided');
        throw new Error('Tool outputs required but executeTool handler is missing');
      }

      logger.info({
        requestId: options.requestId,
        responseId: currentResponse?.id,
        toolCallCount: toolCalls.length,
        operation: 'openaiAgentToolCalls'
      }, 'Processing OpenAI agent tool calls');

      const toolOutputs = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        const callId = toolCall.id;
        let parsedArgs: any = {};

        try {
          parsedArgs = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
        } catch (error: any) {
          logger.error({
            requestId: options.requestId,
            responseId: currentResponse?.id,
            toolId: callId,
            toolName,
            arguments: toolCall.function?.arguments,
            error: error?.message || 'Failed to parse arguments',
            operation: 'openaiAgentToolParsing'
          }, 'Failed to parse tool call arguments');

          parsedArgs = {};
        }

        let result: any;

        try {
          result = await options.executeTool(toolName, parsedArgs);
          logger.info({
            requestId: options.requestId,
            responseId: currentResponse?.id,
            toolId: callId,
            toolName,
            resultType: typeof result,
            operation: 'openaiAgentToolExecution'
          }, 'Tool executed successfully');
        } catch (error: any) {
          logger.error({
            requestId: options.requestId,
            responseId: currentResponse?.id,
            toolId: callId,
            toolName,
            error: error?.message || 'Tool execution failed',
            operation: 'openaiAgentToolExecution'
          }, 'Tool execution failed');

          result = { error: error?.message || 'Tool execution failed' };
        }

        executedToolCalls.push({
          id: callId,
          name: toolName,
          arguments: parsedArgs,
          result
        });

        toolOutputs.push({
          tool_call_id: callId,
          output: JSON.stringify(result ?? {})
        });
      }

      try {
        const followUpResponse = await axios.post(
          `${this.OPENAI_BASE_URL}/responses/${currentResponse.id}/submit_tool_outputs`,
          { tool_outputs: toolOutputs },
          { headers: this.headers, timeout: 60000 }
        );

        currentResponse = followUpResponse.data;
      } catch (error: any) {
        logger.error({
          requestId: options.requestId,
          responseId: currentResponse?.id,
          toolCallCount: toolCalls.length,
          error: error?.response?.data || error?.message,
          operation: 'openaiAgentToolSubmit'
        }, 'Failed to submit tool outputs to OpenAI');
        throw error;
      }
    }

    const outputText = this.extractOutputText(currentResponse);

    logger.info({
      requestId: options.requestId,
      responseId: currentResponse?.id,
      status: currentResponse?.status,
      outputLength: outputText?.length || 0,
      operation: 'openaiAgentResponse'
    }, 'OpenAI agent response processed');

    return {
      outputText: outputText?.trim(),
      rawResponse: currentResponse,
      toolCalls: executedToolCalls
    };
  }

  private static transformMessages(messages: AgentMessage[]) {
    return messages.map(message => {
      if (Array.isArray(message.content)) {
        const content = message.content
          .map(part => this.transformContentPart(part))
          .filter(Boolean);

        return {
          role: message.role,
          content: content.length > 0 ? content : [{ type: 'input_text', text: '' }]
        };
      }

      if (typeof message.content === 'string') {
        return {
          role: message.role,
          content: [{ type: 'input_text', text: message.content }]
        };
      }

      return {
        role: message.role,
        content: [{ type: 'input_text', text: '' }]
      };
    });
  }

  private static transformContentPart(part: AgentMessageContent | any) {
    if (!part) {
      return null;
    }

    if (part.type === 'text' || part.type === 'input_text') {
      return { type: 'input_text', text: part.text ?? '' };
    }

    if (part.type === 'image_url') {
      const imageUrl = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
      if (!imageUrl) {
        return null;
      }
      return {
        type: 'input_image',
        image_url: imageUrl
      };
    }

    if (part.type === 'input_image') {
      return part;
    }

    if (part.type === 'output_text' && part.text?.value) {
      return { type: 'output_text', text: { value: part.text.value } };
    }

    return {
      type: 'input_text',
      text: part.text || ''
    };
  }

  private static transformTools(tools: AgentToolDefinition[]) {
    return (tools || []).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  private static extractOutputText(response: any): string | undefined {
    if (!response) {
      return undefined;
    }

    if (typeof response.output_text === 'string') {
      return response.output_text;
    }

    if (Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item?.type === 'message' || item?.type === 'output_message') {
          const content = item.content || [];
          for (const part of content) {
            if (part?.type === 'output_text' && part?.text?.value) {
              return part.text.value;
            }
            if (part?.type === 'text' && typeof part.text === 'string') {
              return part.text;
            }
          }
        }
      }
    }

    return undefined;
  }
}
