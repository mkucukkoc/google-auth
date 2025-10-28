"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatRouter = void 0;
// Derlenmiş ortamda bu dosya `dist/routes/chatBridge.js` altındadır ve
// gerçek router `dist/routes/chat.js` ile aynı klasördedir.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createChatRouter } = require('./chat');
exports.createChatRouter = createChatRouter;
