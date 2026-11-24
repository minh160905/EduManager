const prisma = require('../../config/prisma');

const EXAM_INCLUDE = {
  subject: { select: { subject_id: true, subject_name: true } },
  teacher: { select: { user_id: true, full_name: true } },
  class_instance: {
    include: {
      class: { select: { class_code: true } },
      year: { select: { year_id: true, name: true, start_date: true, end_date: true } },
    },
  },
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const parseDate = (value, fieldName = 'Ngày kiểm tra') => {
  if (!DATE_PATTERN.test(value || '')) {
    throw { statusCode: 400, message: `${fieldName} không hợp lệ` };
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw { statusCode: 400, message: `${fieldName} không hợp lệ` };
  }
  return date;
};

const toMinutes = (value, fieldName) => {
  if (!TIME_PATTERN.test(value || '')) {
    throw { statusCode: 400, message: `${fieldName} không hợp lệ` };
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const getMyOptions = async (teacherId) => {
  return prisma.teacherAssignment.findMany({
    where: { teacher_id: Number(teacherId) },
    select: {
      assignment_id: true,
      subject: { select: { subject_id: true, subject_name: true } },
      class_instance: {
        include: {
          class: { select: { class_code: true } },
          year: { select: { year_id: true, name: true, start_date: true, end_date: true } },
        },
      },
    },
    orderBy: [
      { class_instance: { year: { start_date: 'desc' } } },
      { class_instance: { grade: 'asc' } },
      { subject: { subject_name: 'asc' } },
    ],
  });
};

const getMine = async (teacherId) => {
  return prisma.examSchedule.findMany({
    where: { teacher_id: Number(teacherId) },
    include: EXAM_INCLUDE,
    orderBy: [{ exam_date: 'desc' }, { start_time: 'asc' }],
  });
};

const create = async (data, teacherId, db = prisma) => {
  const { assignment_id, exam_type, exam_date, start_time, end_time } = data;
  if (!['MIDTERM', 'FINAL'].includes(exam_type)) {
    throw { statusCode: 400, message: 'Loại kiểm tra không hợp lệ' };
  }

  const date = parseDate(exam_date);
  const startMinutes = toMinutes(start_time, 'Giờ bắt đầu');
  const endMinutes = toMinutes(end_time, 'Giờ kết thúc');
  if (startMinutes >= endMinutes) {
    throw { statusCode: 400, message: 'Giờ kết thúc phải sau giờ bắt đầu' };
  }
  if (date.getUTCDay() === 0) {
    throw { statusCode: 400, message: 'Không thể tạo lịch kiểm tra vào Chủ nhật' };
  }

  const assignment = await db.teacherAssignment.findFirst({
    where: {
      assignment_id: Number(assignment_id),
      teacher_id: Number(teacherId),
    },
    include: {
      subject: true,
      class_instance: { include: { class: true, year: true } },
    },
  });
  if (!assignment) {
    throw { statusCode: 403, message: 'Bạn không được phân công giảng dạy lớp và môn học đã chọn' };
  }

  const yearStart = new Date(assignment.class_instance.year.start_date);
  const yearEnd = new Date(assignment.class_instance.year.end_date);
  if (date < yearStart || date > yearEnd) {
    throw { statusCode: 400, message: 'Ngày kiểm tra phải nằm trong thời gian của năm học được phân công' };
  }

  const possibleConflicts = await db.examSchedule.findMany({
    where: {
      exam_date: date,
      OR: [
        { class_instance_id: assignment.class_instance_id },
        { teacher_id: Number(teacherId) },
      ],
    },
    include: EXAM_INCLUDE,
  });
  const conflict = possibleConflicts.find((item) => {
    const itemStart = toMinutes(item.start_time, 'Giờ bắt đầu');
    const itemEnd = toMinutes(item.end_time, 'Giờ kết thúc');
    return startMinutes < itemEnd && endMinutes > itemStart;
  });
  if (conflict) {
    const sameClass = conflict.class_instance_id === assignment.class_instance_id;
    const classLabel = `${conflict.class_instance.grade}${conflict.class_instance.class.class_code}`;
    throw {
      statusCode: 409,
      message: sameClass
        ? `Lớp ${classLabel} đã có lịch kiểm tra trùng thời gian này`
        : `Bạn đã có lịch kiểm tra lớp ${classLabel} trùng thời gian này`,
    };
  }

  return db.examSchedule.create({
    data: {
      teacher_id: Number(teacherId),
      class_instance_id: assignment.class_instance_id,
      subject_id: assignment.subject_id,
      exam_type,
      exam_date: date,
      start_time,
      end_time,
    },
    include: EXAM_INCLUDE,
  });
};

const getForStudent = async (userId, filters = {}, db = prisma) => {
  const student = await db.student.findUnique({
    where: { user_id: Number(userId) },
    select: { class_instance_id: true, enrollments: { select: { class_instance_id: true } } },
  });
  if (!student?.class_instance_id) return [];

  const classIds = student.enrollments?.length ? student.enrollments.map(item => item.class_instance_id) : [student.class_instance_id];
  const where = { class_instance_id: classIds.length === 1 ? classIds[0] : { in: classIds } };
  if (filters.from || filters.to) {
    if (!filters.from || !filters.to) {
      throw { statusCode: 400, message: 'Cần cung cấp đầy đủ ngày bắt đầu và kết thúc' };
    }
    const from = parseDate(filters.from, 'Ngày bắt đầu');
    const to = parseDate(filters.to, 'Ngày kết thúc');
    if (from > to) throw { statusCode: 400, message: 'Khoảng ngày không hợp lệ' };
    const rangeInDays = Math.round((to.getTime() - from.getTime()) / 86400000);
    if (rangeInDays > 31) throw { statusCode: 400, message: 'Chỉ được tra cứu tối đa 31 ngày' };
    where.exam_date = { gte: from, lte: to };
  }

  return db.examSchedule.findMany({
    where,
    include: EXAM_INCLUDE,
    orderBy: [{ exam_date: 'asc' }, { start_time: 'asc' }],
  });
};

const remove = async (id, teacherId) => {
  const existing = await prisma.examSchedule.findFirst({
    where: { exam_schedule_id: Number(id), teacher_id: Number(teacherId) },
  });
  if (!existing) throw { statusCode: 404, message: 'Lịch kiểm tra không tồn tại hoặc không thuộc quyền quản lý của bạn' };
  return prisma.examSchedule.delete({ where: { exam_schedule_id: Number(id) } });
};

module.exports = { getMyOptions, getMine, create, getForStudent, remove };
