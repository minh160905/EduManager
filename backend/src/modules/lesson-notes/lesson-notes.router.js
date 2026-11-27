const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { success } = require('../../utils/response');
const service = require('./lesson-notes.service');
router.use(authenticate, authorize('STUDENT'));
router.get('/', async (req, res, next) => {
  try { success(res, await service.list(req.user.userId, req.query.from, req.query.to)); } catch (error) { next(error); }
});
router.put('/', async (req, res, next) => {
  try { success(res, await service.save(req.user.userId, req.body)); } catch (error) { next(error); }
});
module.exports = router;
