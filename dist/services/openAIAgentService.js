"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIAgentService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
class OpenAIAgentService {
    static get headers() {
        return {
            'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
        };
    }
    static ensureConfigured() {
        if (!this.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not configured');
        }
    }
    static async runAgent(options) {
        this.ensureConfigured();
        const payload = {
            model: options.model,
            input: this.transformMessages(options.messages),
            tools: this.transformTools(options.tools),
            tool_choice: 'auto'
        };
        logger_1.logger.info({
            requestId: options.requestId,
            model: options.model,
            messageCount: options.messages.length,
            toolCount: options.tools.length,
            operation: 'openaiAgentRequest'
        }, 'Sending request to OpenAI responses API');
        let currentResponse;
        try {
            const response = await axios_1.default.post(`${this.OPENAI_BASE_URL}/responses`, payload, {
                headers: this.headers,
                timeout: 60000
            });
            currentResponse = response.data;
        }
        catch (error) {
            logger_1.logger.error({
                requestId: options.requestId,
                model: options.model,
                error: error?.response?.data || error?.message,
                operation: 'openaiAgentRequest'
            }, 'OpenAI agent request failed');
            throw error;
        }
        const executedToolCalls = [];
        while (true) {
            const toolCalls = this.extractToolCalls(currentResponse);
            if (!toolCalls.length) {
                break;
            }
            if (!options.executeTool) {
                logger_1.logger.error({
                    requestId: options.requestId,
                    responseId: currentResponse?.id,
                    toolCallCount: toolCalls.length,
                    operation: 'openaiAgentToolCalls'
                }, 'Tool outputs required but no executeTool handler provided');
                throw new Error('Tool outputs required but executeTool handler is missing');
            }
            logger_1.logger.info({
                requestId: options.requestId,
                responseId: currentResponse?.id,
                toolCallCount: toolCalls.length,
                operation: 'openaiAgentToolCalls'
            }, 'Processing OpenAI agent tool calls');
            const toolOutputs = [];
            for (const toolCall of toolCalls) {
                const toolName = toolCall.name;
                const callId = toolCall.id;
                const rawArguments = toolCall.arguments;
                let parsedArgs = {};
                try {
                    if (typeof rawArguments === 'string' && rawArguments.trim().length > 0) {
                        parsedArgs = JSON.parse(rawArguments);
                    }
                    else if (rawArguments && typeof rawArguments === 'object') {
                        parsedArgs = rawArguments;
                    }
                }
                catch (error) {
                    logger_1.logger.error({
                        requestId: options.requestId,
                        responseId: currentResponse?.id,
                        toolId: callId,
                        toolName,
                        arguments: rawArguments,
                        error: error?.message || 'Failed to parse arguments',
                        operation: 'openaiAgentToolParsing'
                    }, 'Failed to parse tool call arguments');
                    parsedArgs = {};
                }
                let result;
                try {
                    result = await options.executeTool(toolName, parsedArgs);
                    logger_1.logger.info({
                        requestId: options.requestId,
                        responseId: currentResponse?.id,
                        toolId: callId,
                        toolName,
                        resultType: typeof result,
                        operation: 'openaiAgentToolExecution'
                    }, 'Tool executed successfully');
                }
                catch (error) {
                    logger_1.logger.error({
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
            currentResponse = await this.submitToolOutputs({
                responseId: currentResponse?.id,
                requestId: options.requestId,
                toolOutputs,
                toolCallCount: toolCalls.length
            });
        }
        const outputText = this.extractOutputText(currentResponse);
        logger_1.logger.info({
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
    static transformMessages(messages) {
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
    static transformContentPart(part) {
        if (!part) {
            return null;
        }
        if (part.type === 'text' || part.type === 'input_text') {
            return { type: 'input_text', text: part.text ?? '' };
        }
        if (part.type === 'image_url' || part.type === 'input_image') {
            const imageUrl = this.extractImageUrl(part);
            if (!imageUrl) {
                return null;
            }
            return {
                type: 'input_image',
                image_url: imageUrl
            };
        }
        if (part.type === 'output_text' && part.text?.value) {
            return { type: 'output_text', text: { value: part.text.value } };
        }
        return {
            type: 'input_text',
            text: part.text || ''
        };
    }
    static transformTools(tools) {
        return (tools || []).map(tool => ({
            name: tool.name,
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }
    static extractImageUrl(part) {
        if (!part) {
            return undefined;
        }
        const rawUrl = part.image_url;
        if (!rawUrl) {
            return undefined;
        }
        if (typeof rawUrl === 'string') {
            return rawUrl;
        }
        if (typeof rawUrl === 'object') {
            return rawUrl.url;
        }
        return undefined;
    }
    static extractOutputText(response) {
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
                        if (part?.type === 'output_text') {
                            if (typeof part?.text === 'string') {
                                return part.text;
                            }
                            if (part?.text?.value) {
                                return part.text.value;
                            }
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
    static extractToolCalls(response) {
        if (!response) {
            return [];
        }
        const toolCallMap = new Map();
        const requiredActionCalls = response?.required_action?.type === 'submit_tool_outputs'
            ? response.required_action.submit_tool_outputs?.tool_calls || []
            : [];
        for (const call of requiredActionCalls) {
            const id = call?.id || call?.tool_call_id || call?.function?.call_id;
            const name = call?.function?.name;
            if (!id || !name) {
                continue;
            }
            toolCallMap.set(id, {
                id,
                name,
                arguments: call?.function?.arguments ?? '{}'
            });
        }
        if (Array.isArray(response?.output)) {
            for (const item of response.output) {
                if (item?.type === 'function_call') {
                    const id = item?.id || item?.call_id;
                    const name = item?.name || item?.function_call?.name;
                    const args = item?.arguments ?? item?.function_call?.arguments ?? item?.function_call?.input ?? '{}';
                    if (!id || !name) {
                        continue;
                    }
                    toolCallMap.set(id, {
                        id,
                        name,
                        arguments: args
                    });
                }
                if (item?.type === 'message' || item?.type === 'output_message') {
                    const content = item?.content || [];
                    for (const part of content) {
                        if (part?.type === 'tool_call') {
                            const id = part?.id || part?.call_id;
                            const name = part?.name || part?.function_call?.name;
                            const args = part?.arguments ?? part?.function_call?.arguments ?? part?.function_call?.input ?? '{}';
                            if (!id || !name) {
                                continue;
                            }
                            toolCallMap.set(id, {
                                id,
                                name,
                                arguments: args
                            });
                        }
                    }
                }
            }
        }
        return Array.from(toolCallMap.values());
    }
    static async submitToolOutputs(options) {
        if (!options?.responseId) {
            logger_1.logger.error({
                requestId: options?.requestId,
                operation: 'openaiAgentToolSubmit'
            }, 'Cannot submit tool outputs without a responseId');
            throw new Error('Response ID missing while submitting tool outputs');
        }
        try {
            const followUpResponse = await axios_1.default.post(`${this.OPENAI_BASE_URL}/responses/${options.responseId}/submit_tool_outputs`, { tool_outputs: options.toolOutputs }, { headers: this.headers, timeout: 60000 });
            return followUpResponse.data;
        }
        catch (error) {
            logger_1.logger.error({
                requestId: options.requestId,
                responseId: options.responseId,
                toolCallCount: options.toolCallCount,
                error: error?.response?.data || error?.message,
                operation: 'openaiAgentToolSubmit'
            }, 'Failed to submit tool outputs to OpenAI');
            throw error;
        }
    }
}
exports.OpenAIAgentService = OpenAIAgentService;
OpenAIAgentService.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
OpenAIAgentService.OPENAI_BASE_URL = 'https://api.openai.com/v1';
