"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUncaughtException = exports.handleUnhandledRejection = exports.notFound = exports.catchAsync = exports.globalErrorHandler = exports.CustomError = void 0;
const logger_1 = require("../utils/logger");
class CustomError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.CustomError = CustomError;
// MongoDB/Database error handler
const handleMongoError = (error) => {
    let message = 'Database error occurred';
    let statusCode = 500;
    if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        message = `${field} already exists`;
        statusCode = 400;
    }
    else if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err) => err.message);
        message = `Validation Error: ${errors.join(', ')}`;
        statusCode = 400;
    }
    else if (error.name === 'CastError') {
        message = `Invalid ${error.path}: ${error.value}`;
        statusCode = 400;
    }
    return new CustomError(message, statusCode);
};
// JWT error handler
const handleJWTError = () => {
    return new CustomError('Invalid token. Please log in again!', 401);
};
const handleJWTExpiredError = () => {
    return new CustomError('Your token has expired! Please log in again.', 401);
};
// Rate limit error handler
const handleRateLimitError = () => {
    return new CustomError('Too many requests from this IP, please try again later.', 429);
};
// Validation error handler
const handleValidationError = (error) => {
    const errors = Object.values(error.errors).map((err) => err.message);
    const message = `Invalid input data: ${errors.join(', ')}`;
    return new CustomError(message, 400);
};
// Send error response
const sendErrorDev = (err, res) => {
    res.status(err.statusCode || 500).json({
        success: false,
        error: err,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
        path: res.req.url,
        method: res.req.method
    });
};
const sendErrorProd = (err, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode || 500).json({
            success: false,
            message: err.message,
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID') || 'unknown'
        });
    }
    else {
        // Programming or other unknown error: don't leak error details
        logger_1.logger.error('ERROR 💥', err);
        res.status(500).json({
            success: false,
            message: 'Something went wrong!',
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID') || 'unknown'
        });
    }
};
// Global error handling middleware
const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.isOperational = err.isOperational || false;
    // Log error details
    logger_1.logger.error('Error occurred:', {
        message: err.message,
        statusCode: err.statusCode,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    let error = { ...err };
    error.message = err.message;
    // Handle specific error types
    if (err.name === 'ValidationError')
        error = handleValidationError(err);
    if (err.code === 11000)
        error = handleMongoError(err);
    if (err.name === 'JsonWebTokenError')
        error = handleJWTError();
    if (err.name === 'TokenExpiredError')
        error = handleJWTExpiredError();
    if (err.message?.includes('rate limit'))
        error = handleRateLimitError();
    // Send error response based on environment
    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(error, res);
    }
    else {
        sendErrorProd(error, res);
    }
};
exports.globalErrorHandler = globalErrorHandler;
// Async error wrapper
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};
exports.catchAsync = catchAsync;
// 404 handler
const notFound = (req, res, next) => {
    const error = new CustomError(`Not found - ${req.originalUrl}`, 404);
    next(error);
};
exports.notFound = notFound;
// Unhandled promise rejection handler
const handleUnhandledRejection = () => {
    process.on('unhandledRejection', (err) => {
        logger_1.logger.error('UNHANDLED REJECTION! 💥 Shutting down...', err);
        process.exit(1);
    });
};
exports.handleUnhandledRejection = handleUnhandledRejection;
// Uncaught exception handler
const handleUncaughtException = () => {
    process.on('uncaughtException', (err) => {
        logger_1.logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', err);
        process.exit(1);
    });
};
exports.handleUncaughtException = handleUncaughtException;
