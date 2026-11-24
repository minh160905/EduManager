const express = require('express');
const router = express.Router();
const prisma = require('../../config/prisma');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { success, created } = require('../../utils/response');
const { assertClassAccess, assertStudentAccess, getAccessibleClassIds } = require('../../utils/access');

router.use(authenticate);

// GET /conducts?class_instance_id=&semester=&year_id=
// Returns all conduct records for a class in a semester
router.get('/', async (req, res, next) => {
  try {
    const { class_instance_id, semester, year_id, student_id } = req.query;
    const where = {};
    if (semester) where.semester = Number(semester);
    if (year_id) where.year_id = Number(year_id);

    if (req.user.role === 'STUDENT') {
      const student = await prisma.student.findUnique({
        where: { user_id: req.user.userId },
      });
      if (student) {
        where.student_id = student.student_id;
      } else {
        where.student_id = -1;
      }
    } else if (req.user.role === 'PARENT') {
      const parent = await prisma.parent.findUnique({
        where: { user_id: req.user.userId },
        include: { students: true },
      });
      if (parent) {
        const parentStudentIds = parent.students.map((sp) => sp.student_id);
        if (student_id) {
          const queryStudentId = Number(student_id);
          if (parentStudentIds.includes(queryStudentId)) {
            where.student_id = queryStudentId;
          } else {
            where.student_id = -1;
          }
        } else {
          where.student_id = { in: parentStudentIds };
        }
      } else {
        where.student_id = -1;
      }
    } else if (['TEACHER', 'HEAD_OF_DEPARTMENT'].includes(req.user.role)) {
      if (student_id) {
        await assertStudentAccess(req.user, student_id, { yearId: year_id });
        where.student_id = Number(student_id);
      } else if (class_instance_id) {
        await assertClassAccess(req.user, class_instance_id);
        where.student = { enrollments: { some: { class_instance_id: Number(class_instance_id) } } };
      } else {
        const classIds = await getAccessibleClassIds(req.user);
        where.student = { enrollments: { some: { class_instance_id: { in: classIds }, ...(year_id ? { year_id: Number(year_id) } : {}) } } };
      }
    } else {
      // ADMIN, PRINCIPAL
      if (class_instance_id) {
        where.student = { enrollments: { some: { class_instance_id: Number(class_instance_id) } } };
      }
      if (student_id) {
        where.student_id = Number(student_id);
      }
    }

    const conducts = await prisma.conduct.findMany({
      where,
      include: {
        student: { include: { user: { select: { full_name: true, username: true } } } },
        teacher: { select: { full_name: true } },
      },
      orderBy: { updated_at: 'desc' },
    });
    success(res, conducts);
  } catch (e) { next(e); }
});

// PUT /conducts/upsert — create or update a conduct record for a student
router.put('/upsert', authorize('TEACHER', 'HEAD_OF_DEPARTMENT'), async (req, res, next) => {
  try {
    const { student_id, semester, year_id, rating, note } = req.body;

    // Verify teacher is homeroom of student's class (only homeroom can rate conduct)
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { student_id: Number(student_id), year_id: Number(year_id) },
      include: { class_instance: true },
    });
    if (!enrollment) {
      return res.status(400).json({ success: false, message: 'Học sinh chưa có lớp' });
    }
    if (enrollment.class_instance.homeroom_teacher_id !== Number(req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Chỉ GVCN mới được đánh giá hạnh kiểm' });
    }

    const conduct = await prisma.conduct.upsert({
      where: {
        student_id_semester_year_id: {
          student_id: Number(student_id),
          semester: Number(semester),
          year_id: Number(year_id),
        },
      },
      update: {
        rating,
        note: note || null,
        teacher_id: req.user.userId,
      },
      create: {
        student_id: Number(student_id),
        semester: Number(semester),
        year_id: Number(year_id),
        rating,
        note: note || null,
        teacher_id: req.user.userId,
      },
      include: {
        student: { include: { user: { select: { full_name: true } } } },
        teacher: { select: { full_name: true } },
      },
    });
    success(res, conduct, 'Đã cập nhật hạnh kiểm');
  } catch (e) { next(e); }
});

module.exports = router;
