"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemas = exports.sanitizeObject = exports.sanitizeHTML = exports.sanitizeString = exports.validateFileSize = exports.validateFileType = exports.validateUUID = exports.validatePassword = exports.validateEmail = exports.validateRequest = exports.settingsSchemas = exports.apiSchemas = exports.fileSchemas = exports.authSchemas = exports.chatSchemas = exports.userSchemas = void 0;
const joi_1 = __importDefault(require("joi"));
const logger_1 = require("../utils/logger");
// User schemas
exports.userSchemas = {
    create: joi_1.default.object({
        email: joi_1.default.string().email().required().messages({
            'string.email': 'Geçerli bir e-posta adresi giriniz',
            'any.required': 'E-posta adresi zorunludur',
        }),
        password: joi_1.default.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
            'string.min': 'Şifre en az 8 karakter olmalıdır',
            'string.pattern.base': 'Şifre en az bir küçük harf, bir büyük harf, bir rakam ve bir özel karakter içermelidir',
            'any.required': 'Şifre zorunludur',
        }),
        name: joi_1.default.string().min(2).max(50).optional().messages({
            'string.min': 'İsim en az 2 karakter olmalıdır',
            'string.max': 'İsim en fazla 50 karakter olabilir',
        }),
        terms_accepted: joi_1.default.boolean().valid(true).required().messages({
            'any.only': 'Kullanım şartlarını kabul etmelisiniz',
            'any.required': 'Kullanım şartları kabulü zorunludur',
        }),
    }),
    update: joi_1.default.object({
        name: joi_1.default.string().min(2).max(50).optional(),
        email: joi_1.default.string().email().optional(),
        preferences: joi_1.default.object({
            language: joi_1.default.string().valid('tr', 'en', 'es', 'fr', 'pt', 'ru').optional(),
            theme: joi_1.default.string().valid('light', 'dark', 'system').optional(),
            notifications: joi_1.default.boolean().optional(),
        }).optional(),
    }),
    login: joi_1.default.object({
        email: joi_1.default.string().email().required().messages({
            'string.email': 'Geçerli bir e-posta adresi giriniz',
            'any.required': 'E-posta adresi zorunludur',
        }),
        password: joi_1.default.string().required().messages({
            'any.required': 'Şifre zorunludur',
        }),
    }),
};
// Chat schemas
exports.chatSchemas = {
    create: joi_1.default.object({
        title: joi_1.default.string().min(1).max(100).optional().messages({
            'string.min': 'Başlık en az 1 karakter olmalıdır',
            'string.max': 'Başlık en fazla 100 karakter olabilir',
        }),
        user_id: joi_1.default.string().uuid().required().messages({
            'string.guid': 'Geçerli bir kullanıcı ID giriniz',
            'any.required': 'Kullanıcı ID zorunludur',
        }),
        is_favorite: joi_1.default.boolean().optional(),
        tags: joi_1.default.array().items(joi_1.default.string().max(20)).max(10).optional().messages({
            'array.max': 'En fazla 10 etiket ekleyebilirsiniz',
            'string.max': 'Etiket en fazla 20 karakter olabilir',
        }),
    }),
    update: joi_1.default.object({
        title: joi_1.default.string().min(1).max(100).optional(),
        is_favorite: joi_1.default.boolean().optional(),
        tags: joi_1.default.array().items(joi_1.default.string().max(20)).max(10).optional(),
    }),
    message: joi_1.default.object({
        content: joi_1.default.string().min(1).max(10000).required().messages({
            'string.min': 'Mesaj içeriği zorunludur',
            'string.max': 'Mesaj en fazla 10000 karakter olabilir',
            'any.required': 'Mesaj içeriği zorunludur',
        }),
        role: joi_1.default.string().valid('user', 'assistant', 'system').required().messages({
            'any.only': 'Geçerli bir rol seçiniz',
            'any.required': 'Rol zorunludur',
        }),
        chat_id: joi_1.default.string().uuid().required().messages({
            'string.guid': 'Geçerli bir chat ID giriniz',
            'any.required': 'Chat ID zorunludur',
        }),
        attachments: joi_1.default.array().items(joi_1.default.object({
            type: joi_1.default.string().valid('image', 'document', 'audio', 'video').required(),
            url: joi_1.default.string().uri().required(),
            name: joi_1.default.string().max(100).optional(),
            size: joi_1.default.number().positive().max(50 * 1024 * 1024).optional(), // 50MB max
        })).max(5).optional().messages({
            'array.max': 'En fazla 5 dosya ekleyebilirsiniz',
        }),
    }),
};
// Authentication schemas
exports.authSchemas = {
    emailVerification: joi_1.default.object({
        email: joi_1.default.string().email().required().messages({
            'string.email': 'Geçerli bir e-posta adresi giriniz',
            'any.required': 'E-posta adresi zorunludur',
        }),
    }),
    verifyCode: joi_1.default.object({
        email: joi_1.default.string().email().required(),
        code: joi_1.default.string().length(6).pattern(/^\d+$/).required().messages({
            'string.length': 'Kod 6 haneli olmalıdır',
            'string.pattern.base': 'Kod sadece rakamlardan oluşmalıdır',
            'any.required': 'Kod zorunludur',
        }),
    }),
    passwordReset: joi_1.default.object({
        email: joi_1.default.string().email().required().messages({
            'string.email': 'Geçerli bir e-posta adresi giriniz',
            'any.required': 'E-posta adresi zorunludur',
        }),
    }),
    resetPassword: joi_1.default.object({
        token: joi_1.default.string().required().messages({
            'any.required': 'Token zorunludur',
        }),
        password: joi_1.default.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
            'string.min': 'Şifre en az 8 karakter olmalıdır',
            'string.pattern.base': 'Şifre en az bir küçük harf, bir büyük harf, bir rakam ve bir özel karakter içermelidir',
            'any.required': 'Şifre zorunludur',
        }),
        confirmPassword: joi_1.default.string().valid(joi_1.default.ref('password')).required().messages({
            'any.only': 'Şifreler eşleşmiyor',
            'any.required': 'Şifre onayı zorunludur',
        }),
    }),
};
// File upload schemas
exports.fileSchemas = {
    upload: joi_1.default.object({
        type: joi_1.default.string().valid('image', 'document', 'audio', 'video').required().messages({
            'any.only': 'Geçerli bir dosya türü seçiniz',
            'any.required': 'Dosya türü zorunludur',
        }),
        size: joi_1.default.number().positive().max(50 * 1024 * 1024).required().messages({
            'number.max': 'Dosya boyutu 50MB\'dan küçük olmalıdır',
            'any.required': 'Dosya boyutu zorunludur',
        }),
        name: joi_1.default.string().min(1).max(100).required().messages({
            'string.min': 'Dosya adı zorunludur',
            'string.max': 'Dosya adı en fazla 100 karakter olabilir',
            'any.required': 'Dosya adı zorunludur',
        }),
    }),
    image: joi_1.default.object({
        width: joi_1.default.number().positive().max(4000).optional(),
        height: joi_1.default.number().positive().max(4000).optional(),
        format: joi_1.default.string().valid('jpeg', 'jpg', 'png', 'gif', 'webp').optional(),
    }),
    document: joi_1.default.object({
        format: joi_1.default.string().valid('pdf', 'doc', 'docx', 'txt', 'rtf').required(),
        pages: joi_1.default.number().positive().max(1000).optional(),
    }),
};
// API request schemas
exports.apiSchemas = {
    pagination: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1).messages({
            'number.min': 'Sayfa numarası 1\'den küçük olamaz',
        }),
        limit: joi_1.default.number().integer().min(1).max(100).default(20).messages({
            'number.min': 'Limit 1\'den küçük olamaz',
            'number.max': 'Limit 100\'den büyük olamaz',
        }),
        sort: joi_1.default.string().valid('asc', 'desc').default('desc').messages({
            'any.only': 'Sıralama sadece asc veya desc olabilir',
        }),
        sortBy: joi_1.default.string().max(50).optional(),
    }),
    search: joi_1.default.object({
        query: joi_1.default.string().min(1).max(100).required().messages({
            'string.min': 'Arama terimi zorunludur',
            'string.max': 'Arama terimi en fazla 100 karakter olabilir',
            'any.required': 'Arama terimi zorunludur',
        }),
        filters: joi_1.default.object().optional(),
        dateFrom: joi_1.default.date().iso().optional().messages({
            'date.format': 'Geçerli bir tarih formatı giriniz (ISO 8601)',
        }),
        dateTo: joi_1.default.date().iso().min(joi_1.default.ref('dateFrom')).optional().messages({
            'date.format': 'Geçerli bir tarih formatı giriniz (ISO 8601)',
            'date.min': 'Bitiş tarihi başlangıç tarihinden sonra olmalıdır',
        }),
    }),
};
// Settings schemas
exports.settingsSchemas = {
    update: joi_1.default.object({
        language: joi_1.default.string().valid('tr', 'en', 'es', 'fr', 'pt', 'ru').optional(),
        theme: joi_1.default.string().valid('light', 'dark', 'system').optional(),
        notifications: joi_1.default.object({
            email: joi_1.default.boolean().optional(),
            push: joi_1.default.boolean().optional(),
            marketing: joi_1.default.boolean().optional(),
        }).optional(),
        privacy: joi_1.default.object({
            profile_visibility: joi_1.default.string().valid('public', 'private', 'friends').optional(),
            data_sharing: joi_1.default.boolean().optional(),
        }).optional(),
    }),
};
// Validation middleware
const validateRequest = (schema, property = 'body') => {
    return (req, res, next) => {
        const data = req[property];
        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
            convert: true,
        });
        if (error) {
            const errorDetails = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value,
            }));
            logger_1.logger.warn('Validation error', {
                property,
                errors: errorDetails,
                data,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Geçersiz veri',
                    details: errorDetails,
                },
                timestamp: new Date().toISOString(),
            });
        }
        // Replace the original data with validated and sanitized data
        req[property] = value;
        next();
    };
};
exports.validateRequest = validateRequest;
// Custom validation functions
const validateEmail = (email) => {
    const emailSchema = joi_1.default.string().email();
    const { error } = emailSchema.validate(email);
    return !error;
};
exports.validateEmail = validateEmail;
const validatePassword = (password) => {
    const passwordSchema = joi_1.default.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/);
    const { error } = passwordSchema.validate(password);
    if (error) {
        return {
            valid: false,
            errors: error.details.map(detail => detail.message),
        };
    }
    return { valid: true, errors: [] };
};
exports.validatePassword = validatePassword;
const validateUUID = (uuid) => {
    const uuidSchema = joi_1.default.string().uuid();
    const { error } = uuidSchema.validate(uuid);
    return !error;
};
exports.validateUUID = validateUUID;
const validateFileType = (filename, allowedTypes) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? allowedTypes.includes(extension) : false;
};
exports.validateFileType = validateFileType;
const validateFileSize = (size, maxSize) => {
    return size <= maxSize;
};
exports.validateFileSize = validateFileSize;
// Sanitization functions
const sanitizeString = (input) => {
    return input.trim().replace(/[<>]/g, '');
};
exports.sanitizeString = sanitizeString;
const sanitizeHTML = (input) => {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};
exports.sanitizeHTML = sanitizeHTML;
const sanitizeObject = (obj) => {
    if (typeof obj === 'string') {
        return (0, exports.sanitizeString)(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(exports.sanitizeObject);
    }
    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                sanitized[key] = (0, exports.sanitizeObject)(obj[key]);
            }
        }
        return sanitized;
    }
    return obj;
};
exports.sanitizeObject = sanitizeObject;
// Export all schemas
exports.schemas = {
    user: exports.userSchemas,
    chat: exports.chatSchemas,
    auth: exports.authSchemas,
    file: exports.fileSchemas,
    api: exports.apiSchemas,
    settings: exports.settingsSchemas,
};
