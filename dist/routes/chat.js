"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatRouter = void 0;
// Bridge to the compiled router to avoid changing runtime behavior
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createChatRouter } = require('../../dist/routes/chat');
exports.createChatRouter = createChatRouter;
