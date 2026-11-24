require('dotenv').config();
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const EXPECTED = [
  { name: '2024-2025', classes: 9, students: 90, assignments: 72, schedules: 270, scores: 7200, conducts: 180 },
  { name: '2025-2026', classes: 9, students: 90, assignments: 72, schedules: 270, scores: 7200, conducts: 180 },
  { name: '2026-2027', classes: 12, students: 120, assignments: 96, schedules: 360, scores: 2880, conducts: 120 },
];

async function verifyYear(expected) {
  const year = await prisma.academicYear.findUnique({ where: { name: expected.name } });
  assert.ok(year, `Thiếu năm học ${expected.name}`);
  const classes = await prisma.classInstance.findMany({
    where: { year_id: year.year_id },
    include: { class: true, _count: { select: { enrollments: true, teacher_assignments: true, schedules: true } } },
  });
  assert.equal(classes.length, expected.classes, `${expected.name}: số lớp`);
  for (const item of classes) {
    const label = `${item.grade}${item.class.class_code}`;
    assert.ok(item.homeroom_teacher_id, `${expected.name}/${label}: thiếu GVCN`);
    assert.equal(item._count.enrollments, 10, `${expected.name}/${label}: số học sinh`);
    assert.equal(item._count.teacher_assignments, 8, `${expected.name}/${label}: số phân công`);
    assert.equal(item._count.schedules, 30, `${expected.name}/${label}: số tiết/tuần`);
  }
  const classIds = classes.map(item => item.class_instance_id);
  const [assignments, schedules, scores, conducts] = await Promise.all([
    prisma.teacherAssignment.findMany({ where: { class_instance_id: { in: classIds } } }),
    prisma.schedule.findMany({ where: { class_instance_id: { in: classIds } } }),
    prisma.score.count({ where: { year_id: year.year_id } }),
    prisma.conduct.count({ where: { year_id: year.year_id } }),
  ]);
  assert.equal(assignments.length, expected.assignments, `${expected.name}: tổng phân công`);
  assert.equal(schedules.length, expected.schedules, `${expected.name}: tổng tiết`);
  assert.equal(scores, expected.scores, `${expected.name}: tổng điểm`);
  assert.equal(conducts, expected.conducts, `${expected.name}: tổng hạnh kiểm`);
  const scoreGroups = await prisma.score.groupBy({
    by: ['semester', 'score_type'], where: { year_id: year.year_id }, _count: { _all: true },
  });
  const scoreCount = new Map(scoreGroups.map(item => [`${item.semester}-${item.score_type}`, item._count._all]));
  const subjectsPerYear = expected.students * 8;
  for (const semester of expected.name === '2026-2027' ? [1] : [1, 2]) {
    assert.equal(scoreCount.get(`${semester}-TX`), subjectsPerYear * (expected.name === '2026-2027' ? 2 : 3), `${expected.name}: điểm thường xuyên kỳ ${semester}`);
    assert.equal(scoreCount.get(`${semester}-GK`), subjectsPerYear, `${expected.name}: điểm giữa kỳ ${semester}`);
    if (expected.name !== '2026-2027') assert.equal(scoreCount.get(`${semester}-CK`), subjectsPerYear, `${expected.name}: điểm cuối kỳ ${semester}`);
  }
  if (expected.name === '2026-2027') assert.ok(!scoreCount.has('1-CK') && !scoreCount.has('2-TX'), 'Năm hiện tại không nên có điểm cuối kỳ hoặc học kỳ II mẫu');
  const studentIds = (await prisma.studentEnrollment.findMany({
    where: { class_instance_id: { in: classIds } }, select: { student_id: true },
  })).map(item => item.student_id);
  const parentLinks = await prisma.studentParent.count({ where: { student_id: { in: studentIds } } });
  assert.ok(parentLinks >= classes.length, `${expected.name}: thiếu liên kết phụ huynh`);
  const assignmentMap = new Map(assignments.map(item => [`${item.class_instance_id}-${item.subject_id}`, item.teacher_id]));
  const homeroomIds = new Set();
  for (const item of classes) {
    if (expected.name !== '2024-2025') {
      assert.ok(assignments.some(assignment => assignment.class_instance_id === item.class_instance_id && assignment.teacher_id === item.homeroom_teacher_id), `${expected.name}/${item.grade}${item.class.class_code}: GVCN chưa dạy lớp`);
    }
    assert.ok(!homeroomIds.has(item.homeroom_teacher_id), `${expected.name}: GVCN phụ trách hai lớp`);
    homeroomIds.add(item.homeroom_teacher_id);
  }
  const teacherSlots = new Set();
  const roomSlots = new Set();
  let conflictCount = 0;
  let mismatchCount = 0;
  for (const slot of schedules) {
    if (assignmentMap.get(`${slot.class_instance_id}-${slot.subject_id}`) !== slot.teacher_id) mismatchCount++;
    const teacherKey = `${slot.teacher_id}-${slot.day_of_week}-${slot.period}`;
    const roomKey = `${slot.room}-${slot.day_of_week}-${slot.period}`;
    if (teacherSlots.has(teacherKey) || (slot.room && roomSlots.has(roomKey))) conflictCount++;
    teacherSlots.add(teacherKey);
    if (slot.room) roomSlots.add(roomKey);
  }
  // The original 2024-2025 seed may contain teacher overlaps; do not alter historical records.
  if (expected.name !== '2024-2025') {
    assert.equal(conflictCount, 0, `${expected.name}: xung đột giáo viên/phòng`);
    assert.equal(mismatchCount, 0, `${expected.name}: lịch không khớp phân công`);
  }
  const teacherIds = [...new Set([...assignments.map(item => item.teacher_id), ...classes.map(item => item.homeroom_teacher_id)])];
  const teachers = await prisma.user.findMany({ where: { user_id: { in: teacherIds } }, include: { role: true } });
  assert.equal(teachers.length, teacherIds.length, `${expected.name}: giáo viên không tồn tại`);
  assert.ok(teachers.every(item => ['TEACHER', 'HEAD_OF_DEPARTMENT'].includes(item.role.role_name)), `${expected.name}: phân công sai vai trò`);
  return { year: expected.name, classes: classes.length, students: classes.reduce((sum, item) => sum + item._count.enrollments, 0),
    parentLinks, assignments: assignments.length, schedules: schedules.length, scores, conducts, conflicts: conflictCount, assignmentMismatches: mismatchCount };
}

async function main() {
  for (const expected of EXPECTED) console.log(JSON.stringify(await verifyYear(expected)));
  const classes = await prisma.classInstance.findMany({
    where: { year: { name: { in: ['2024-2025', '2025-2026', '2026-2027'] } } },
    include: { class: true, year: true, enrollments: { select: { student_id: true } } },
  });
  const byKey = new Map(classes.map(item => [`${item.year.name}:${item.grade}${item.class.class_code}`, new Set(item.enrollments.map(e => e.student_id))]));
  const same = (left, right) => left.size === right.size && [...left].every(id => right.has(id));
  for (const code of ['A', 'B', 'C']) {
    assert.ok(same(byKey.get(`2024-2025:10${code}`), byKey.get(`2025-2026:11${code}`)), `10${code}/2024 phải lên 11${code}/2025`);
    assert.ok(same(byKey.get(`2024-2025:10${code}`), byKey.get(`2026-2027:12${code}`)), `11${code}/2025 phải lên 12${code}/2026`);
    assert.ok(same(byKey.get(`2024-2025:11${code}`), byKey.get(`2025-2026:12${code}`)), `11${code}/2024 phải lên 12${code}/2025`);
    assert.ok(same(byKey.get(`2025-2026:10${code}`), byKey.get(`2026-2027:11${code}`)), `10${code}/2025 phải lên 11${code}/2026`);
    assert.equal([...byKey.get(`2024-2025:10${code}`)].filter(id => byKey.get(`2025-2026:10${code}`).has(id)).length, 0, `10${code}/2025 phải là khóa mới`);
  }
  const graduatedIds = [...classes.filter(item => item.year.name === '2024-2025' && item.grade === 12).flatMap(item => item.enrollments.map(e => e.student_id))];
  const graduated = await prisma.student.count({ where: { student_id: { in: graduatedIds }, graduated_at: { not: null } } });
  assert.equal(graduated, 30, 'Học sinh lớp 12 năm 2024-2025 phải được đánh dấu đã tốt nghiệp');
  const wrongEnrollmentYear = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM student_enrollments e
    JOIN class_instances c ON c.class_instance_id = e.class_instance_id
    WHERE e.year_id <> c.year_id
  `;
  assert.equal(Number(wrongEnrollmentYear[0].n), 0, 'Lịch sử xếp lớp có năm học không khớp');
  const scoresOutsideEnrollment = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM scores s
    LEFT JOIN student_enrollments e ON e.student_id = s.student_id AND e.year_id = s.year_id
    WHERE s.year_id IS NOT NULL AND e.enrollment_id IS NULL
  `;
  assert.equal(Number(scoresOutsideEnrollment[0].n), 0, 'Có điểm thuộc năm học mà học sinh không có lớp');
  const conductsOutsideEnrollment = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM conducts c
    LEFT JOIN student_enrollments e ON e.student_id = c.student_id AND e.year_id = c.year_id
    WHERE e.enrollment_id IS NULL
  `;
  assert.equal(Number(conductsOutsideEnrollment[0].n), 0, 'Có hạnh kiểm thuộc năm học mà học sinh không có lớp');
  const teachers = await prisma.user.count({ where: { role: { role_name: { in: ['TEACHER', 'HEAD_OF_DEPARTMENT'] } } } });
  assert.equal(teachers, 32, 'Số giáo viên đã thay đổi');
  const indexes = await prisma.$queryRawUnsafe('SHOW INDEX FROM scores');
  assert.ok(indexes.some(item => item.Key_name === 'scores_unique_result'), 'Thiếu unique index chống trùng điểm');
  console.log('Kiểm tra đạt: 32 giáo viên hiện có; học sinh lên lớp đúng khóa và lớp 12 cũ được đánh dấu tốt nghiệp.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
