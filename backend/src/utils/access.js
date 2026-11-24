const prisma = require('../config/prisma');

const SCHOOL_WIDE_ROLES = new Set(['ADMIN', 'PRINCIPAL']);
const EDUCATOR_ROLES = new Set(['TEACHER', 'HEAD_OF_DEPARTMENT']);

const hasSchoolWideAccess = (user) => SCHOOL_WIDE_ROLES.has(user?.role);

/**
 * Ensure an educator is related to a class. School-wide roles bypass this check.
 * By default a homeroom relationship or any teaching assignment is accepted.
 */
const assertClassAccess = async (
  user,
  classInstanceId,
  { subjectId, homeroomOnly = false, assignmentOnly = false } = {},
  db = prisma,
) => {
  if (hasSchoolWideAccess(user)) return;
  if (!EDUCATOR_ROLES.has(user?.role)) {
    throw { statusCode: 403, message: 'Bạn không có quyền truy cập lớp học này' };
  }

  const classId = Number(classInstanceId);
  if (!Number.isInteger(classId)) {
    throw { statusCode: 400, message: 'Lớp học không hợp lệ' };
  }

  const relations = [];
  if (!assignmentOnly) relations.push({ homeroom_teacher_id: Number(user.userId) });
  if (!homeroomOnly) {
    relations.push({
      teacher_assignments: {
        some: {
          teacher_id: Number(user.userId),
          ...(subjectId ? { subject_id: Number(subjectId) } : {}),
        },
      },
    });
  }

  const accessible = await db.classInstance.findFirst({
    where: {
      class_instance_id: classId,
      OR: relations,
    },
    select: { class_instance_id: true },
  });

  if (!accessible) {
    throw { statusCode: 403, message: 'Bạn không được phân công phụ trách lớp học này' };
  }
};

const assertStudentAccess = async (user, studentId, options = {}, db = prisma) => {
  const student = await db.student.findUnique({
    where: { student_id: Number(studentId) },
    select: { student_id: true, class_instance_id: true },
  });
  if (!student) throw { statusCode: 404, message: 'Học sinh không tồn tại' };
  if (!student.class_instance_id) {
    if (hasSchoolWideAccess(user)) return student;
    throw { statusCode: 403, message: 'Học sinh chưa được xếp lớp' };
  }
  const enrollment = options.yearId ? await db.studentEnrollment.findFirst({
    where: { student_id: student.student_id, year_id: Number(options.yearId) },
  }) : null;
  if (options.yearId && !enrollment) throw { statusCode: 404, message: 'Học sinh không thuộc năm học này' };
  await assertClassAccess(user, enrollment?.class_instance_id || student.class_instance_id, options, db);
  return student;
};

const getAccessibleClassIds = async (user, db = prisma) => {
  if (hasSchoolWideAccess(user)) return null;
  if (!EDUCATOR_ROLES.has(user?.role)) return [];

  const classes = await db.classInstance.findMany({
    where: {
      OR: [
        { homeroom_teacher_id: Number(user.userId) },
        { teacher_assignments: { some: { teacher_id: Number(user.userId) } } },
      ],
    },
    select: { class_instance_id: true },
  });
  return classes.map((item) => item.class_instance_id);
};

module.exports = {
  assertClassAccess,
  assertStudentAccess,
  getAccessibleClassIds,
  hasSchoolWideAccess,
};
