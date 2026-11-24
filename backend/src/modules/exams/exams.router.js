const express = require('express');
const router = express.Router();
const svc = require('./exams.service');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { success, created } = require('../../utils/response');

router.use(authenticate);

router.get('/my-options', authorize('TEACHER', 'HEAD_OF_DEPARTMENT'), async (req, res, next) => {
  try { success(res, await svc.getMyOptions(req.user.userId)); } catch (error) { next(error); }
});

router.get('/my', authorize('TEACHER', 'HEAD_OF_DEPARTMENT'), async (req, res, next) => {
  try { success(res, await svc.getMine(req.user.userId)); } catch (error) { next(error); }
});

router.get('/student', authorize('STUDENT'), async (req, res, next) => {
  try { success(res, await svc.getForStudent(req.user.userId, req.query)); } catch (error) { next(error); }
});

router.post('/', authorize('TEACHER', 'HEAD_OF_DEPARTMENT'), async (req, res, next) => {
  try { created(res, await svc.create(req.body, req.user.userId), 'Đã tạo lịch kiểm tra'); } catch (error) { next(error); }
});

router.delete('/:id', authorize('TEACHER', 'HEAD_OF_DEPARTMENT'), async (req, res, next) => {
  try { success(res, await svc.remove(req.params.id, req.user.userId), 'Đã xóa lịch kiểm tra'); } catch (error) { next(error); }
});

module.exports = router;
