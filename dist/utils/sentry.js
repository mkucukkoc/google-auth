"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sentryErrorHandler = exports.sentryTracingHandler = exports.sentryRequestHandler = exports.captureError = exports.ErrorTypes = exports.finishTransaction = exports.startTransaction = exports.setContext = exports.setTag = exports.addBreadcrumb = exports.setUser = exports.captureMessage = exports.captureException = exports.initSentry = void 0;
const Sentry = __importStar(require("@sentry/node"));
const profiling_node_1 = require("@sentry/profiling-node");
const node_1 = require("@sentry/node");
const node_2 = require("@sentry/node");
const initSentry = () => {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        integrations: [
            // Enable HTTP calls tracing
            (0, node_1.httpIntegration)(),
            // Enable Express.js tracing
            (0, node_2.expressIntegration)(),
            // Enable profiling
            (0, profiling_node_1.nodeProfilingIntegration)(),
        ],
        // Performance Monitoring
        beforeSend(event) {
            // Filter out sensitive data
            if (event.request?.cookies) {
                delete event.request.cookies;
            }
            if (event.request?.headers?.authorization) {
                event.request.headers.authorization = '[Filtered]';
            }
            return event;
        },
    });
};
exports.initSentry = initSentry;
const captureException = (error, context) => {
    Sentry.withScope((scope) => {
        if (context) {
            scope.setContext('additional_info', context);
        }
        Sentry.captureException(error);
    });
};
exports.captureException = captureException;
const captureMessage = (message, level = 'info', context) => {
    Sentry.withScope((scope) => {
        if (context) {
            scope.setContext('additional_info', context);
        }
        Sentry.captureMessage(message, level);
    });
};
exports.captureMessage = captureMessage;
const setUser = (user) => {
    Sentry.setUser(user);
};
exports.setUser = setUser;
const addBreadcrumb = (message, category, level = 'info', data) => {
    Sentry.addBreadcrumb({
        message,
        category,
        level,
        data,
        timestamp: Date.now() / 1000,
    });
};
exports.addBreadcrumb = addBreadcrumb;
const setTag = (key, value) => {
    Sentry.setTag(key, value);
};
exports.setTag = setTag;
const setContext = (key, context) => {
    Sentry.setContext(key, context);
};
exports.setContext = setContext;
// Performance monitoring
const startTransaction = (name, op) => {
    return Sentry.startSpan({ name, op }, () => { });
};
exports.startTransaction = startTransaction;
const finishTransaction = (transaction) => {
    // Transactions are automatically finished in new Sentry versions
    return transaction;
};
exports.finishTransaction = finishTransaction;
// Custom error types for better categorization
exports.ErrorTypes = {
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    VALIDATION: 'validation',
    NETWORK: 'network',
    DATABASE: 'database',
    EXTERNAL_API: 'external_api',
    BUSINESS_LOGIC: 'business_logic',
    SYSTEM: 'system',
};
const captureError = (error, type, context) => {
    Sentry.withScope((scope) => {
        scope.setTag('error_type', type);
        if (context) {
            scope.setContext('error_context', context);
        }
        Sentry.captureException(error);
    });
};
exports.captureError = captureError;
// Request ID middleware for Sentry
const sentryRequestHandler = () => { };
exports.sentryRequestHandler = sentryRequestHandler;
const sentryTracingHandler = () => { };
exports.sentryTracingHandler = sentryTracingHandler;
const sentryErrorHandler = () => { };
exports.sentryErrorHandler = sentryErrorHandler;
