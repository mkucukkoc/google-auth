import { Router } from 'express';

// Derlenmiş ortamda bu dosya `dist/routes/chatBridge.js` altındadır ve
// gerçek router `dist/routes/chat.js` ile aynı klasördedir.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createChatRouter }: { createChatRouter: () => Router } = require('./chat');

export { createChatRouter };


