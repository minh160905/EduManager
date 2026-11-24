/**
 * Additive, repeatable demo data for 2025–2026 and 2026–2027.
 * Never run prisma/seed.js for this purpose: that file deletes existing data.
 * Phase 1 creates complete class data; promote_demo_cohorts.js then links the same
 * students across years and replaces the temporary duplicate upper-grade cohorts.
 * Run only once on a fresh demo database from backend/: node prisma/seed_multi_year_demo.js [--dry-run]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generate } = require('../src/modules/schedules/auto-schedule.service');

const prisma = new PrismaClient();
const YEARS = [
  { name: '2025-2026', start: '2025-09-05', end: '2026-05-31', codes: ['A', 'B', 'C'], complete: true },
  { name: '2026-2027', start: '2026-09-05', end: '2027-05-31', codes: ['A', 'B', 'C', 'D'], complete: false },
];
const GRADES = [10, 11, 12];
const STUDENTS_PER_CLASS = 10;
const PARENT_STUDENT_NUMBERS = [1, 5, 9];
const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];
const GIVEN = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Khánh', 'Linh', 'Minh', 'Ngọc', 'Phúc', 'Quân', 'Trang', 'Vy'];
const HOMETOWNS = ['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'Huế', 'Cần Thơ', 'Nghệ An'];
const SUBJECT_PERIODS = { 'Toán': 5, 'Văn': 5, 'Tiếng Anh': 4, 'Lý': 4, 'Hóa': 3, 'Sinh': 3, 'Sử': 3, 'Địa': 3 };

const date = value => new Date(`${value}T00:00:00.000Z`);
const shortYear = value => value.replace(/20/g, '');
const hashNumber = value => [...value].reduce((acc, ch) => (acc * 31 + ch.codePointAt(0)) >>> 0, 17);
const clamp = value => Math.max(2, Math.min(10, Math.round(value * 10) / 10));

function identity(config, grade, code, number) {
  const suffix = `${grade}${code.toLowerCase()}_${String(number).padStart(2, '0')}`;
  const tag = shortYear(config.name).replace('-', '');
  const serial = hashNumber(`${config.name}-${grade}-${code}-${number}`);
  const gender = serial % 2 ? 'Nam' : 'Nữ';
  return {
    username: `demo_hs_${tag}_${suffix}`,
    studentCode: `DM${tag}${grade}${code}${String(number).padStart(2, '0')}`,
    name: `${SURNAMES[serial % SURNAMES.length]} ${gender === 'Nam' ? 'Minh' : 'Ngọc'} ${GIVEN[Math.floor(serial / 7) % GIVEN.length]}`,
    gender,
    hometown: HOMETOWNS[Math.floor(serial / 11) % HOMETOWNS.length],
    birth: `${Number(config.name.slice(0, 4)) - grade - 6}-${String(1 + serial % 12).padStart(2, '0')}-${String(1 + serial % 27).padStart(2, '0')}`,
  };
}

async function createManyBatches(model, rows, batchSize = 500) {
  let count = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const result = await model.createMany({ data: rows.slice(offset, offset + batchSize), skipDuplicates: true });
    count += result.count;
  }
  return count;
}

async function teacherPools(subjects) {
  const pools = new Map();
  for (const subject of subjects) {
    const ids = (subject.department?.members || [])
      .filter(member => member.teacher.status === 'ACTIVE' && ['TEACHER', 'HEAD_OF_DEPARTMENT'].includes(member.teacher.role.role_name))
      .map(member => member.teacher_id).sort((a, b) => a - b);
    if (ids.length < 2) throw new Error(`Môn ${subject.subject_name} cần ít nhất 2 giáo viên đang hoạt động trong tổ chuyên môn`);
    pools.set(subject.subject_id, ids);
  }
  return pools;
}

async function ensureClasses(config, year, classMap, subjects, pools) {
  const classes = [];
  for (const grade of GRADES) {
    for (const code of config.codes) {
      const classId = classMap.get(code).class_id;
      const instance = await prisma.classInstance.upsert({
        where: { class_id_year_id_grade: { class_id: classId, year_id: year.year_id, grade } },
        create: { class_id: classId, year_id: year.year_id, grade },
        update: {},
      });
      classes.push({ ...instance, code, label: `${grade}${code}` });
    }
  }

  for (let index = 0; index < classes.length; index++) {
    const instance = classes[index];
    for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex++) {
      const subject = subjects[subjectIndex];
      const pool = pools.get(subject.subject_id);
      const teacherId = pool[(index + subjectIndex + (config.complete ? 1 : 2)) % pool.length];
      await prisma.teacherAssignment.upsert({
        where: { class_instance_id_subject_id: { class_instance_id: instance.class_instance_id, subject_id: subject.subject_id } },
        create: { class_instance_id: instance.class_instance_id, subject_id: subject.subject_id, teacher_id: teacherId },
        update: {},
      });
    }
  }

  const assignments = await prisma.teacherAssignment.findMany({
    where: { class_instance_id: { in: classes.map(item => item.class_instance_id) } },
  });
  const usedHomeroom = new Set(classes.map(item => item.homeroom_teacher_id).filter(Boolean));
  for (const instance of classes) {
    if (instance.homeroom_teacher_id) continue;
    const candidate = assignments.find(item => item.class_instance_id === instance.class_instance_id && !usedHomeroom.has(item.teacher_id));
    if (!candidate) throw new Error(`Không tìm được giáo viên chủ nhiệm riêng cho lớp ${instance.label} năm ${config.name}`);
    await prisma.classInstance.update({
      where: { class_instance_id: instance.class_instance_id },
      data: { homeroom_teacher_id: candidate.teacher_id },
    });
    instance.homeroom_teacher_id = candidate.teacher_id;
    usedHomeroom.add(candidate.teacher_id);
  }
  return { classes, assignments };
}

async function ensureSchedules(config, year, classes, subjects) {
  const classIds = classes.map(item => item.class_instance_id);
  const existing = await prisma.schedule.count({ where: { class_instance_id: { in: classIds } } });
  if (existing) {
    if (existing !== classes.length * 30) throw new Error(`${config.name} có ${existing} tiết đã lưu; cần kiểm tra lịch chưa đầy đủ trước khi chạy lại`);
    return 0;
  }
  const periodConfig = Object.fromEntries(subjects.map(subject => [subject.subject_id, SUBJECT_PERIODS[subject.subject_name]]));
  const generated = await generate({
    year_id: year.year_id,
    classInstanceIds: classIds,
    periodsPerGrade: { 10: periodConfig, 11: periodConfig, 12: periodConfig },
    maxTeacherPeriodsPerDay: 5,
    maxClassPeriodsPerDay: 5,
  });
  const expected = classes.length * 30;
  if (generated.failed.length || generated.scheduled.length !== expected) {
    throw new Error(`Không thể xếp đủ lịch ${config.name}: ${generated.scheduled.length}/${expected}, lỗi ${generated.failed.length}`);
  }
  const teacherSlots = new Set();
  const classSlots = new Set();
  for (const slot of generated.scheduled) {
    const teacherKey = `${slot.teacher_id}-${slot.day_of_week}-${slot.period}`;
    const classKey = `${slot.class_instance_id}-${slot.day_of_week}-${slot.period}`;
    if (teacherSlots.has(teacherKey) || classSlots.has(classKey)) throw new Error(`Lịch ${config.name} bị trùng giáo viên hoặc lớp`);
    teacherSlots.add(teacherKey);
    classSlots.add(classKey);
  }
  const codeById = new Map(classes.map(item => [item.class_instance_id, item.label]));
  const rows = generated.scheduled.map(slot => ({
    class_instance_id: slot.class_instance_id,
    day_of_week: slot.day_of_week,
    period: slot.period,
    subject_id: slot.subject_id,
    teacher_id: slot.teacher_id,
    room: `P${codeById.get(slot.class_instance_id)}`,
  }));
  return createManyBatches(prisma.schedule, rows, 1000);
}

async function ensureStudentsAndParents(config, year, classes, studentRole, parentRole, studentPassword, parentPassword) {
  const expected = [];
  for (const instance of classes) {
    for (let number = 1; number <= STUDENTS_PER_CLASS; number++) {
      expected.push({ ...identity(config, instance.grade, instance.code, number), instance, number });
    }
  }
  const newUsers = expected.map(item => ({
    username: item.username,
    password_hash: studentPassword,
    full_name: item.name,
    email: `${item.username}@example.test`,
    role_id: studentRole.role_id,
    status: 'ACTIVE',
  }));
  const insertedUsers = await createManyBatches(prisma.user, newUsers);
  const studentUsers = await prisma.user.findMany({
    where: { username: { in: expected.map(item => item.username) } },
    select: { user_id: true, username: true, role_id: true },
  });
  const userByName = new Map(studentUsers.map(item => [item.username, item]));
  if (studentUsers.length !== expected.length || studentUsers.some(item => item.role_id !== studentRole.role_id)) throw new Error('Tài khoản học sinh mẫu bị trùng với vai trò khác');
  const insertedStudents = await createManyBatches(prisma.student, expected.map(item => ({
    user_id: userByName.get(item.username).user_id,
    student_code: item.studentCode,
    date_of_birth: date(item.birth),
    gender: item.gender,
    hometown: item.hometown,
    class_instance_id: item.instance.class_instance_id,
  })));
  const students = await prisma.student.findMany({
    where: { student_code: { in: expected.map(item => item.studentCode) } },
    select: { student_id: true, student_code: true, user_id: true, class_instance_id: true },
  });
  const studentByCode = new Map(students.map(item => [item.student_code, item]));
  for (const item of expected) {
    const student = studentByCode.get(item.studentCode);
    if (!student || student.class_instance_id !== item.instance.class_instance_id || student.user_id !== userByName.get(item.username).user_id) {
      throw new Error(`Hồ sơ ${item.studentCode} không khớp lớp hoặc tài khoản`);
    }
  }

  const linked = expected.filter(item => PARENT_STUDENT_NUMBERS.includes(item.number));
  const parentName = item => `demo_ph_${shortYear(config.name).replace('-', '')}_${item.instance.grade}${item.instance.code.toLowerCase()}_${String(item.number).padStart(2, '0')}`;
  const insertedParentUsers = await createManyBatches(prisma.user, linked.map(item => ({
    username: parentName(item),
    password_hash: parentPassword,
    full_name: `Phụ huynh mẫu của ${item.name}`,
    email: `${parentName(item)}@example.test`,
    role_id: parentRole.role_id,
    status: 'ACTIVE',
  })));
  const parentUsers = await prisma.user.findMany({
    where: { username: { in: linked.map(parentName) } },
    select: { user_id: true, username: true, role_id: true },
  });
  if (parentUsers.length !== linked.length || parentUsers.some(item => item.role_id !== parentRole.role_id)) throw new Error('Tài khoản phụ huynh mẫu bị trùng với vai trò khác');
  const parentByName = new Map(parentUsers.map(item => [item.username, item]));
  const insertedParents = await createManyBatches(prisma.parent, linked.map(item => ({ user_id: parentByName.get(parentName(item)).user_id })));
  const parents = await prisma.parent.findMany({
    where: { user_id: { in: parentUsers.map(item => item.user_id) } },
    select: { parent_id: true, user_id: true },
  });
  const parentByUser = new Map(parents.map(item => [item.user_id, item]));
  const insertedLinks = await createManyBatches(prisma.studentParent, linked.map(item => ({
    student_id: studentByCode.get(item.studentCode).student_id,
    parent_id: parentByUser.get(parentByName.get(parentName(item)).user_id).parent_id,
  })));
  return { expected, studentByCode, insertedUsers, insertedStudents, insertedParentUsers, insertedParents, insertedLinks };
}

async function ensureAssessments(config, year, classes, assignments, expected, studentByCode, subjects) {
  const assignmentByClassSubject = new Map(assignments.map(item => [`${item.class_instance_id}-${item.subject_id}`, item.teacher_id]));
  const homeroomByClass = new Map(classes.map(item => [item.class_instance_id, item.homeroom_teacher_id]));
  const scoreRows = [];
  const conductRows = [];
  for (const item of expected) {
    const studentId = studentByCode.get(item.studentCode).student_id;
    const ability = 4.5 + (hashNumber(item.studentCode) % 45) / 10;
    for (const semester of config.complete ? [1, 2] : [1]) {
      const rating = ability >= 8 ? 'EXCELLENT' : ability >= 6.5 ? 'GOOD' : ability >= 5 ? 'AVERAGE' : 'WEAK';
      conductRows.push({
        student_id: studentId,
        year_id: year.year_id,
        semester,
        teacher_id: homeroomByClass.get(item.instance.class_instance_id),
        rating,
        note: `Đánh giá mẫu học kỳ ${semester}, năm học ${config.name}`,
      });
      for (const subject of subjects) {
        const teacherId = assignmentByClassSubject.get(`${item.instance.class_instance_id}-${subject.subject_id}`);
        if (!teacherId) throw new Error(`Thiếu phân công ${item.instance.label}/${subject.subject_name}`);
        const variation = (hashNumber(`${item.studentCode}-${subject.subject_id}-${semester}`) % 21 - 10) / 10;
        const base = ability + variation + (semester === 2 ? 0.2 : 0);
        const types = config.complete
          ? [['TX', 1], ['TX', 2], ['TX', 3], ['GK', 0], ['CK', 0]]
          : [['TX', 1], ['TX', 2], ['GK', 0]];
        for (const [scoreType, orderNo] of types) {
          const drift = (hashNumber(`${item.studentCode}-${subject.subject_id}-${semester}-${scoreType}-${orderNo}`) % 11 - 5) / 10;
          scoreRows.push({
            student_id: studentId,
            subject_id: subject.subject_id,
            year_id: year.year_id,
            semester,
            score_type: scoreType,
            score_value: clamp(base + drift),
            order_no: orderNo,
            created_by: teacherId,
          });
        }
      }
    }
  }
  const studentIds = expected.map(item => studentByCode.get(item.studentCode).student_id);
  const existingScores = await prisma.score.findMany({
    where: { year_id: year.year_id, student_id: { in: studentIds } },
    select: { student_id: true, subject_id: true, year_id: true, semester: true, score_type: true, order_no: true },
  });
  const scoreKey = item => [item.student_id, item.subject_id, item.year_id, item.semester, item.score_type, item.order_no].join(':');
  const existingKeys = new Set(existingScores.map(scoreKey));
  if (existingKeys.size !== existingScores.length) throw new Error(`${config.name} có điểm mẫu bị trùng; hãy chạy repair_demo_scores.js trước`);
  return {
    scores: await createManyBatches(prisma.score, scoreRows.filter(item => !existingKeys.has(scoreKey(item)))),
    conducts: await createManyBatches(prisma.conduct, conductRows),
  };
}

async function main() {
  const promoted = await prisma.studentEnrollment.count();
  if (promoted) throw new Error('Dữ liệu đã được chuyển lớp. Không chạy lại seed_multi_year_demo.js vì sẽ tạo lại học sinh mẫu trùng.');
  const subjects = await prisma.subject.findMany({
    where: { subject_name: { in: Object.keys(SUBJECT_PERIODS) } },
    include: { department: { include: { members: { include: { teacher: { include: { role: true } } } } } } },
    orderBy: { subject_id: 'asc' },
  });
  if (subjects.length !== Object.keys(SUBJECT_PERIODS).length) throw new Error('Thiếu một hoặc nhiều môn trong bộ dữ liệu gốc');
  const pools = await teacherPools(subjects);
  const studentRole = await prisma.role.findUnique({ where: { role_name: 'STUDENT' } });
  const parentRole = await prisma.role.findUnique({ where: { role_name: 'PARENT' } });
  if (!studentRole || !parentRole) throw new Error('Thiếu role STUDENT hoặc PARENT');
  const teacherCountBefore = await prisma.user.count({ where: { role: { role_name: { in: ['TEACHER', 'HEAD_OF_DEPARTMENT'] } } } });
  const classCount = YEARS.reduce((sum, item) => sum + item.codes.length * GRADES.length, 0);
  console.log(`Kế hoạch: ${YEARS.map(item => item.name).join(', ')}, ${classCount} lớp, ${classCount * STUDENTS_PER_CLASS} học sinh, ${classCount * PARENT_STUDENT_NUMBERS.length} phụ huynh liên kết.`);
  console.log(`Giáo viên hiện có: ${teacherCountBefore}; sẽ không tạo thêm giáo viên.`);
  if (process.argv.includes('--dry-run')) return;

  const studentPassword = await bcrypt.hash('DemoStudent@2026', 10);
  const parentPassword = await bcrypt.hash('DemoParent@2026', 10);
  const summary = [];
  for (const config of YEARS) {
    const year = await prisma.academicYear.upsert({
      where: { name: config.name },
      create: {
        name: config.name,
        start_date: date(config.start),
        end_date: date(config.end),
        is_locked_sem1: config.complete,
        is_locked_sem2: config.complete,
      },
      update: {},
    });
    const classMap = new Map();
    for (const code of config.codes) {
      classMap.set(code, await prisma.class.upsert({ where: { class_code: code }, create: { class_code: code }, update: {} }));
    }
    const { classes, assignments } = await ensureClasses(config, year, classMap, subjects, pools);
    const schedules = await ensureSchedules(config, year, classes, subjects);
    const people = await ensureStudentsAndParents(config, year, classes, studentRole, parentRole, studentPassword, parentPassword);
    const assessments = await ensureAssessments(config, year, classes, assignments, people.expected, people.studentByCode, subjects);
    summary.push({ year: config.name, classes: classes.length, students: people.insertedStudents,
      parents: people.insertedParents, links: people.insertedLinks, schedules, ...assessments });
    console.log(JSON.stringify(summary[summary.length - 1]));
  }
  const teacherCountAfter = await prisma.user.count({ where: { role: { role_name: { in: ['TEACHER', 'HEAD_OF_DEPARTMENT'] } } } });
  if (teacherCountAfter !== teacherCountBefore) throw new Error('Số giáo viên đã thay đổi ngoài dự kiến');
  console.log('Hoàn tất. Giáo viên không thay đổi; dữ liệu năm 2024-2025 được giữ nguyên.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
