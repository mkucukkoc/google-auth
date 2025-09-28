"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseBuilder = void 0;
class ResponseBuilder {
    static success(data, message) {
        return {
            success: true,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                version: process.env.API_VERSION || 'v1',
            },
        };
    }
    static error(code, message, details) {
        return {
            success: false,
            error: {
                code,
                message,
                details,
            },
            meta: {
                timestamp: new Date().toISOString(),
                version: process.env.API_VERSION || 'v1',
            },
        };
    }
    static paginated(data, page, limit, total) {
        const totalPages = Math.ceil(total / limit);
        return {
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
            meta: {
                timestamp: new Date().toISOString(),
                version: process.env.API_VERSION || 'v1',
            },
        };
    }
}
exports.ResponseBuilder = ResponseBuilder;
