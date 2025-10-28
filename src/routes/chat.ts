import { Router } from 'express';

// Bridge to the compiled router to avoid changing runtime behavior
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createChatRouter }: { createChatRouter: () => Router } = require('../../dist/routes/chat');

export { createChatRouter };


