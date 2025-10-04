"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessJwt = signAccessJwt;
exports.verifyAccessJwt = verifyAccessJwt;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("./config");
function signAccessJwt(userId, deviceId) {
    const payload = {
        sub: userId,
        type: 'access',
        device_id: deviceId,
        iss: config_1.config.jwt.iss,
        aud: config_1.config.jwt.aud,
    };
    return jsonwebtoken_1.default.sign(payload, config_1.config.jwt.hsSecret, {
        algorithm: 'HS256',
        expiresIn: `${config_1.config.jwt.accessTtlMin}m`,
    });
}
function verifyAccessJwt(token) {
    return jsonwebtoken_1.default.verify(token, config_1.config.jwt.hsSecret, {
        algorithms: ['HS256'],
        audience: config_1.config.jwt.aud,
        issuer: config_1.config.jwt.iss,
    });
}
