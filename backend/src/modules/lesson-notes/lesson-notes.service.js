const prisma = require('../../config/prisma');

const PERIOD_START = ['07:00', '07:50', '08:45', '09:40', '10:30', '13:00', '13:50', '14:45', '15:40', '16:30'];
const bad = (message, statusCode = 400) => ({ statusCode, message });
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad('Ngày học không hợp lệ');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw bad('Ngày học không hợp lệ');
  return date;
}
async function studentFor(userId) {
  const student = await prisma.student.findUnique({ where: { user_id: Number(userId) }, include: { enrollments: true } });
  if (!student) throw bad('Không tìm thấy học sinh', 404);
  return student;
}
async function list(userId, from, to) {
  const start = parseDate(from), end = parseDate(to);
  if (start > end || end - start > 31 * 86400000) throw bad('Khoảng thời gian không hợp lệ');
  const student = await studentFor(userId);
  return prisma.lessonNote.findMany({ where: { student_id: student.student_id, lesson_date: { gte: start, lte: end } } });
}
async function save(userId, data) {
  const date = parseDate(data.lesson_date);
  const scheduleId = Number(data.schedule_id);
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!Number.isInteger(scheduleId) || scheduleId <= 0 || !content || content.length > 2000 || typeof data.completed !== 'boolean') {
    throw bad('Nội dung ghi chú cần từ 1 đến 2000 ký tự và trạng thái hợp lệ');
  }
  const student = await studentFor(userId);
  const schedule = await prisma.schedule.findUnique({ where: { schedule_id: scheduleId }, include: { class_instance: { include: { year: true } } } });
  const allowed = student.class_instance_id === schedule?.class_instance_id || student.enrollments.some(e => e.class_instance_id === schedule?.class_instance_id);
  if (!schedule || !allowed) throw bad('Bạn không có quyền ghi chú cho tiết học này', 403);
  if (date.getUTCDay() + 1 !== schedule.day_of_week || date < schedule.class_instance.year.start_date || date > schedule.class_instance.year.end_date) {
    throw bad('Ngày không thuộc tiết học hoặc năm học đã chọn');
  }
  return prisma.lessonNote.upsert({
    where: { student_id_schedule_id_lesson_date: { student_id: student.student_id, schedule_id: scheduleId, lesson_date: date } },
    create: { student_id: student.student_id, schedule_id: scheduleId, lesson_date: date, content, completed: data.completed },
    update: { content, completed: data.completed },
  });
}

// The school uses Vietnam time (UTC+7); timestamps stored by Prisma are UTC.
function lessonStart(note) {
  const time = PERIOD_START[note.schedule.period - 1];
  return time ? new Date(`${note.lesson_date.toISOString().slice(0, 10)}T${time}:00+07:00`) : null;
}
async function sendDueReminders(now = new Date()) {
  const firstDate = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  firstDate.setUTCDate(firstDate.getUTCDate() - 1);
  const lastDate = new Date(firstDate.getTime() + 3 * 86400000);
  const notes = await prisma.lessonNote.findMany({
    where: { completed: false, reminded_at: null, lesson_date: { gte: firstDate, lte: lastDate } },
    include: { student: true, schedule: { include: { subject: true } } },
  });
  for (const note of notes) {
    const start = lessonStart(note);
    if (!start || now >= start || now < new Date(start.getTime() - 86400000)) continue;
    try {
      await prisma.$transaction(async tx => {
      const claimed = await tx.lessonNote.updateMany({ where: { note_id: note.note_id, completed: false, reminded_at: null }, data: { reminded_at: now } });
      if (!claimed.count) return;
      const date = note.lesson_date.toISOString().slice(0, 10).split('-').reverse().join('/');
      await tx.notification.create({ data: {
        title: 'Nhắc hoàn thành ghi chú tiết học',
        content: `${note.schedule.subject.subject_name} — ${date}, ${PERIOD_START[note.schedule.period - 1]}: ${note.content}`,
        created_by: note.student.user_id,
        receivers: { create: { user_id: note.student.user_id } },
      } });
      });
    } catch (error) {
      console.error(`Không thể gửi nhắc nhở ghi chú ${note.note_id}:`, error.message);
    }
  }
}
module.exports = { list, save, sendDueReminders, lessonStart, parseDate };
