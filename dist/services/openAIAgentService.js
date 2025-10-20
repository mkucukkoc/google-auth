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
            'Content-Type': 'application/json'
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
        while (currentResponse?.required_action?.type === 'submit_tool_outputs') {
            const toolCalls = currentResponse.required_action?.submit_tool_outputs?.tool_calls || [];
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
                const toolName = toolCall.function?.name;
                const callId = toolCall.id;
                let parsedArgs = {};
                try {
                    parsedArgs = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
                }
                catch (error) {
                    logger_1.logger.error({
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
            try {
                const followUpResponse = await axios_1.default.post(`${this.OPENAI_BASE_URL}/responses/${currentResponse.id}/submit_tool_outputs`, { tool_outputs: toolOutputs }, { headers: this.headers, timeout: 60000 });
                currentResponse = followUpResponse.data;
            }
            catch (error) {
                logger_1.logger.error({
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
                image_url: {
                    url: imageUrl
                }
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
exports.OpenAIAgentService = OpenAIAgentService;
OpenAIAgentService.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
OpenAIAgentService.OPENAI_BASE_URL = 'https://api.openai.com/v1';
