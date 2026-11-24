const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../../middleware/auth.middleware');
const { success } = require('../../utils/response');
const chatbot = require('./chatbot.service');

const router = express.Router();
const questionSchema = z.object({ question: z.string().trim().min(3).max(500) }).strict();
const lastRequests = new Map();

router.use(authenticate);
router.post('/ask', async (req, res, next) => {
  try {
    const { question } = questionSchema.parse(req.body);
    const userId = req.user.userId;
    const now = Date.now();
    const recent = (lastRequests.get(userId) || []).filter(time => now - time < 60_000);
    if (recent.length >= 10) {
      return res.status(429).json({ success: false, message: 'Bạn đã gửi quá nhiều câu hỏi. Vui lòng thử lại sau một phút.' });
    }
    recent.push(now);
    lastRequests.set(userId, recent);
    success(res, await chatbot.answer(question, req.user.role, req.user.userId));
  } catch (error) { next(error); }
});

module.exports = router;
