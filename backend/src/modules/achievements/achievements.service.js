const prisma = require('../../config/prisma');
const cloudinary = require('../../config/cloudinary');
const { assertClassAccess, hasSchoolWideAccess } = require('../../utils/access');

const create = async (data, studentUserId, files = []) => {
  // Get student id from user
  const student = await prisma.student.findUnique({ where: { user_id: Number(studentUserId) } });
  if (!student) throw { statusCode: 404, message: 'Student profile not found' };

  return prisma.$transaction(async (tx) => {
    const achievement = await tx.achievement.create({
      data: {
        student_id: student.student_id,
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        status: 'PENDING',
      },
    });

    // Save Cloudinary file info
    if (files.length > 0) {
      await tx.achievementFile.createMany({
        data: files.map((file) => ({
          achievement_id: achievement.achievement_id,
          file_url: file.path,
          file_type: file.mimetype || 'unknown',
        })),
      });
    }

    return tx.achievement.findUnique({
      where: { achievement_id: achievement.achievement_id },
      include: { files: true, student: { include: { user: { select: { full_name: true } } } } },
    });
  });
};

const getAll = async (filters = {}, user) => {
  const where = {};

  if (user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { user_id: user.userId } });
    where.student_id = student ? student.student_id : -1;
  } else if (user.role === 'PARENT') {
    const parent = await prisma.parent.findUnique({
      where: { user_id: user.userId },
      include: { students: true },
    });
    if (parent) {
      const parentStudentIds = parent.students.map(sp => sp.student_id);
      if (filters.studentId) {
        const queryStudentId = Number(filters.studentId);
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
  } else if (['TEACHER', 'HEAD_OF_DEPARTMENT'].includes(user.role)) {
    // GVCN only sees achievements of students in their homeroom classes
    const classInstances = await prisma.classInstance.findMany({
      where: { homeroom_teacher_id: Number(user.userId) },
      include: { students: true },
    });
    const studentIds = classInstances.flatMap(ci => ci.students.map(s => s.student_id));
    if (filters.studentId) {
      const queryStudentId = Number(filters.studentId);
      if (studentIds.includes(queryStudentId)) {
        where.student_id = queryStudentId;
      } else {
        where.student_id = -1;
      }
    } else {
      where.student_id = { in: studentIds };
    }
  } else if (['ADMIN', 'PRINCIPAL'].includes(user.role)) {
    // Admin and Principal see all achievements
    if (filters.studentId) {
      where.student_id = Number(filters.studentId);
    }
  }

  if (filters.status) where.status = filters.status;

  return prisma.achievement.findMany({
    where,
    include: {
      student: { include: { user: { select: { full_name: true } } } },
      reviewer: { select: { full_name: true } },
      files: true,
      comments: { include: { teacher: { select: { full_name: true } } } },
    },
    orderBy: { submitted_at: 'desc' },
  });
};

const review = async (id, status, teacherUserId, comment) => {
  const achievement = await prisma.achievement.findUnique({
    where: { achievement_id: Number(id) },
    include: { student: { include: { class_instance: true } } },
  });
  if (!achievement) throw { statusCode: 404, message: 'Achievement not found' };

  const ci = achievement.student.class_instance;
  // PRINCIPAL has school-wide authority and can review any achievement
  // Regular teachers must be the homeroom teacher of the student's class
  const user = await prisma.user.findUnique({
    where: { user_id: Number(teacherUserId) },
    include: { role: true },
  });
  const isPrincipal = user?.role?.role_name === 'PRINCIPAL';
  if (!isPrincipal && (!ci || ci.homeroom_teacher_id !== Number(teacherUserId))) {
    throw { statusCode: 403, message: 'Chỉ GVCN của lớp mới có thể duyệt thành tích này' };
  }

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw { statusCode: 400, message: 'Status must be APPROVED or REJECTED' };
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.achievement.update({
      where: { achievement_id: Number(id) },
      data: { status, reviewed_by: Number(teacherUserId), reviewed_at: new Date() },
      include: { student: { include: { user: { select: { full_name: true } } } } },
    });

    if (comment && String(comment).trim()) {
      await tx.achievementComment.create({
        data: { achievement_id: Number(id), teacher_id: Number(teacherUserId), comment: String(comment).trim() },
      });
    }

    return updated;
  });
};

const addComment = async (id, user, comment) => {
  const achievement = await prisma.achievement.findUnique({
    where: { achievement_id: Number(id) },
    select: { student: { select: { class_instance_id: true } } },
  });
  if (!achievement) throw { statusCode: 404, message: 'Achievement not found' };
  if (!comment || !String(comment).trim()) {
    throw { statusCode: 400, message: 'Nội dung bình luận không được để trống' };
  }
  await assertClassAccess(user, achievement.student.class_instance_id, { homeroomOnly: true });

  return prisma.achievementComment.create({
    data: { achievement_id: Number(id), teacher_id: Number(user.userId), comment: String(comment).trim() },
    include: { teacher: { select: { full_name: true } } },
  });
};

/**
 * Delete a file from Cloudinary by its public_id derived from file_url
 */
const deleteFile = async (fileId, user) => {
  const file = await prisma.achievementFile.findUnique({
    where: { file_id: Number(fileId) },
    include: {
      achievement: {
        include: {
          student: { select: { user_id: true, class_instance_id: true } },
        },
      },
    },
  });
  if (!file) throw { statusCode: 404, message: 'File not found' };

  if (user.role === 'STUDENT') {
    const ownsFile = file.achievement.student.user_id === Number(user.userId);
    if (!ownsFile || file.achievement.status !== 'PENDING') {
      throw { statusCode: 403, message: 'Bạn chỉ có thể xóa file của thành tích đang chờ duyệt của mình' };
    }
  } else if (!hasSchoolWideAccess(user)) {
    await assertClassAccess(user, file.achievement.student.class_instance_id, { homeroomOnly: true });
  }

  // Extract public_id from Cloudinary URL
  // URL format: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<folder>/<public_id>.<ext>
  try {
    const parts = file.file_url.split('/');
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx !== -1) {
      // Everything after "upload/v<version>/" is the public_id (with extension)
      const afterUpload = parts.slice(uploadIdx + 2).join('/');
      const publicId = afterUpload.replace(/\.[^/.]+$/, ''); // remove extension
      const resourceType = file.file_type.startsWith('image/') ? 'image' : 'raw';
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    }
  } catch (e) {
    console.warn('⚠️ Could not delete from Cloudinary:', e.message);
  }

  return prisma.achievementFile.delete({ where: { file_id: Number(fileId) } });
};

module.exports = { create, getAll, review, addComment, deleteFile };
