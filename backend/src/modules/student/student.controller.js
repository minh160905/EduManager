const svc = require('./student.service');
const { success, badRequest } = require('../../utils/response');
const { assertStudentAccess } = require('../../utils/access');

const getReport = async (req, res, next) => {
  try {
    const { semester = 1, studentId, yearId } = req.query;
    let targetStudentId;

    if (req.user.role === 'STUDENT') {
      const student = await svc.getStudentByUserId(req.user.userId);
      targetStudentId = student.student_id;
    } else if (req.user.role === 'PARENT') {
      // Parent must specify studentId
      if (!studentId) return badRequest(res, 'studentId is required for parents');
      const children = await svc.getStudentsByParentUserId(req.user.userId);
      const requestedStudentId = Number(studentId);
      if (!children.some((child) => child.student_id === requestedStudentId)) {
        throw { statusCode: 403, message: 'Bạn không có quyền xem thông tin học sinh này' };
      }
      targetStudentId = requestedStudentId;
    } else {
      if (!studentId) return badRequest(res, 'studentId is required');
      targetStudentId = Number(studentId);
      await assertStudentAccess(req.user, targetStudentId, { yearId });
    }

    const report = await svc.getStudentReport(targetStudentId, semester, yearId);
    return success(res, report);
  } catch (e) { next(e); }
};

const getMyChildren = async (req, res, next) => {
  try {
    const children = await svc.getStudentsByParentUserId(req.user.userId);
    return success(res, children);
  } catch (e) { next(e); }
};

module.exports = { getReport, getMyChildren };
