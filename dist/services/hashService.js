"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HashService = void 0;
const argon2_1 = __importDefault(require("argon2"));
class HashService {
    /**
     * Hash a password using Argon2id
     */
    static async hashPassword(password) {
        return argon2_1.default.hash(password, this.ARGON2_OPTIONS);
    }
    /**
     * Verify a password against its hash
     */
    static async verifyPassword(password, hash) {
        try {
            return await argon2_1.default.verify(hash, password);
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Hash a refresh token using Argon2id
     */
    static async hashRefreshToken(token) {
        return argon2_1.default.hash(token, {
            ...this.ARGON2_OPTIONS,
            memoryCost: 2 ** 14, // 16 MB (lighter for frequent operations)
            timeCost: 2,
        });
    }
    /**
     * Verify a refresh token against its hash
     */
    static async verifyRefreshToken(token, hash) {
        try {
            return await argon2_1.default.verify(hash, token);
        }
        catch (error) {
            return false;
        }
    }
}
exports.HashService = HashService;
HashService.ARGON2_OPTIONS = {
    type: argon2_1.default.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
};
