/** Correct the first multi-year demo seed while keeping historical class records. */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const YEARS = ['2024-2025', '2025-2026', '2026-2027'];
const CODE = ['A', 'B', 'C'];
const hashNumber = value => [...value].reduce((acc, ch) => (acc * 31 + ch.codePointAt(0)) >>> 0, 17);
const clamp = value => Math.max(2, Math.min(10, Math.round(value * 10) / 10));

async function main() {
  const years = await prisma.academicYear.findMany({ where: { name: { in: YEARS } } });
  if (years.length !== 3) throw new Error('Thiếu một trong ba năm học mẫu');
  const yearByName = new Map(years.map(year => [year.name, year]));
  const instances = await prisma.classInstance.findMany({
    where: { year_id: { in: years.map(year => year.year_id) } },
    include: { class: true },
  });
  const yearNameById = new Map(years.map(year => [year.year_id, year.name]));
  const instanceByKey = new Map(instances.map(item => [`${yearNameById.get(item.year_id)}:${item.grade}${item.class.class_code}`, item]));
  const getClass = (year, grade, code) => {
    const result = instanceByKey.get(`${year}:${grade}${code}`);
    if (!result) throw new Error(`Thiếu lớp ${grade}${code}/${year}`);
    return result;
  };
  const originalEnrollments = await prisma.studentEnrollment.findMany({
    where: { class_instance_id: getClass(YEARS[0], 10, 'A').class_instance_id }, select: { student_id: true },
  });
  const promotedEnrollments = await prisma.studentEnrollment.findMany({
    where: { class_instance_id: getClass(YEARS[1], 11, 'A').class_instance_id }, select: { student_id: true },
  });
  if (originalEnrollments.length === 10 && promotedEnrollments.length === 10
    && promotedEnrollments.every(item => originalEnrollments.some(old => old.student_id === item.student_id))) {
    console.log('Dữ liệu đã chuyển lớp; không thay đổi thêm.');
    return;
  }
  if (originalEnrollments.length || promotedEnrollments.length) throw new Error('Dữ liệu đã chuyển lớp một phần; cần kiểm tra thủ công');
  const oldStudents = await prisma.student.findMany({
    where: { class_instance_id: { in: instances.filter(item => item.year_id === yearByName.get(YEARS[0]).year_id).map(item => item.class_instance_id) } },
    select: { student_id: true, student_code: true, class_instance_id: true },
  });
  const newStudents = await prisma.student.findMany({
    where: { user: { username: { startsWith: 'demo_hs_' } } },
    select: { student_id: true, student_code: true, class_instance_id: true, user_id: true, user: { select: { username: true } } },
  });
  const studentsByClass = new Map();
  for (const student of [...oldStudents, ...newStudents]) {
    const list = studentsByClass.get(student.class_instance_id) || [];
    list.push(student);
    studentsByClass.set(student.class_instance_id, list);
  }
  const redundant = [];
  const rosters = [];
  for (const code of CODE) {
    for (const grade of [10, 11, 12]) {
      const source = studentsByClass.get(getClass(YEARS[0], grade, code).class_instance_id) || [];
      if (source.length !== 10) throw new Error(`Lớp ${grade}${code}/2024-2025 cần đúng 10 học sinh trước khi chuyển`);
      rosters.push({ year: YEARS[0], grade, code, students: source });
    }
    const entry2025 = (studentsByClass.get(getClass(YEARS[1], 10, code).class_instance_id) || []).filter(s => s.user?.username?.startsWith('demo_hs_'));
    if (entry2025.length !== 10) throw new Error(`Lớp 10${code}/2025-2026 cần đúng 10 học sinh mới`);
    rosters.push({ year: YEARS[1], grade: 10, code, students: entry2025 });
    rosters.push({ year: YEARS[1], grade: 11, code, students: studentsByClass.get(getClass(YEARS[0], 10, code).class_instance_id) });
    rosters.push({ year: YEARS[1], grade: 12, code, students: studentsByClass.get(getClass(YEARS[0], 11, code).class_instance_id) });
    rosters.push({ year: YEARS[2], grade: 10, code, students: studentsByClass.get(getClass(YEARS[2], 10, code).class_instance_id) || [] });
    rosters.push({ year: YEARS[2], grade: 11, code, students: entry2025 });
    rosters.push({ year: YEARS[2], grade: 12, code, students: studentsByClass.get(getClass(YEARS[0], 10, code).class_instance_id) });
    for (const year of [YEARS[1], YEARS[2]]) for (const grade of [11, 12]) {
      const duplicates = (studentsByClass.get(getClass(year, grade, code).class_instance_id) || []).filter(s => s.user?.username?.startsWith('demo_hs_'));
      if (duplicates.length !== 10) throw new Error(`Lớp ${grade}${code}/${year} không khớp nhóm học sinh mẫu cần thay`);
      redundant.push(...duplicates);
    }
  }
  for (const grade of [10, 11, 12]) {
    const students = studentsByClass.get(getClass(YEARS[2], grade, 'D').class_instance_id) || [];
    if (students.length !== 10) throw new Error(`Lớp ${grade}D/2026-2027 cần đúng 10 học sinh`);
    rosters.push({ year: YEARS[2], grade, code: 'D', students });
  }
  if (redundant.length !== 120 || rosters.some(item => item.students.length !== 10)) throw new Error('Sĩ số mẫu không khớp, dừng trước khi thay đổi dữ liệu');

  const redundantIds = redundant.map(item => item.student_id);
  const links = await prisma.studentParent.findMany({ where: { student_id: { in: redundantIds } } });
  const parentIds = [...new Set(links.map(item => item.parent_id))];
  const parents = await prisma.parent.findMany({ where: { parent_id: { in: parentIds } } });
  const parentUserIds = parents.map(item => item.user_id);
  const linkedElsewhere = await prisma.studentParent.count({ where: { parent_id: { in: parentIds }, student_id: { notIn: redundantIds } } });
  const [scoreHistories, comments, achievements, studentNotifications, parentNotifications] = await Promise.all([
    prisma.scoreHistory.count({ where: { score: { student_id: { in: redundantIds } } } }),
    prisma.comment.count({ where: { student_id: { in: redundantIds } } }),
    prisma.achievement.count({ where: { student_id: { in: redundantIds } } }),
    prisma.notificationReceiver.count({ where: { user_id: { in: redundant.map(item => item.user_id) } } }),
    prisma.notificationReceiver.count({ where: { user_id: { in: parentUserIds } } }),
  ]);
  if (linkedElsewhere || scoreHistories || comments || achievements || studentNotifications || parentNotifications) {
    throw new Error('Nhóm mẫu đã có dữ liệu phát sinh hoặc phụ huynh dùng chung; không tự động thay thế');
  }
  const backup = {
    students: await prisma.student.findMany({ where: { student_id: { in: redundantIds } } }),
    users: await prisma.user.findMany({ where: { user_id: { in: [...redundant.map(item => item.user_id), ...parentUserIds] } } }),
    scores: await prisma.score.findMany({ where: { student_id: { in: redundantIds } } }),
    conducts: await prisma.conduct.findMany({ where: { student_id: { in: redundantIds } } }),
    parents, links,
  };
  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `demo_progression_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Đã lưu bản sao ${redundant.length} hồ sơ mẫu cần thay vào ${backupPath}`);
  if (process.argv.includes('--dry-run')) return;

  const assignments = await prisma.teacherAssignment.findMany({ where: { class_instance_id: { in: instances.map(item => item.class_instance_id) } } });
  const teacherByClassSubject = new Map(assignments.map(item => [`${item.class_instance_id}:${item.subject_id}`, item.teacher_id]));
  const subjectIds = [...new Set(assignments.map(item => item.subject_id))];
  const scoreRows = [];
  const conductRows = [];
  for (const roster of rosters.filter(item => item.year !== YEARS[0] && item.grade > 10 && item.code !== 'D')) {
    const instance = getClass(roster.year, roster.grade, roster.code);
    const year = yearByName.get(roster.year);
    for (const student of roster.students) {
      const ability = 4.5 + (hashNumber(student.student_code || String(student.student_id)) % 45) / 10;
      for (const semester of roster.year === YEARS[2] ? [1] : [1, 2]) {
        conductRows.push({ student_id: student.student_id, year_id: year.year_id, semester,
          teacher_id: instance.homeroom_teacher_id,
          rating: ability >= 8 ? 'EXCELLENT' : ability >= 6.5 ? 'GOOD' : ability >= 5 ? 'AVERAGE' : 'WEAK',
          note: `Đánh giá mẫu học kỳ ${semester}, năm học ${roster.year}` });
        for (const subjectId of subjectIds) {
          const teacherId = teacherByClassSubject.get(`${instance.class_instance_id}:${subjectId}`);
          if (!teacherId) throw new Error(`Thiếu phân công lớp ${roster.grade}${roster.code}`);
          const variation = (hashNumber(`${student.student_code}-${subjectId}-${semester}`) % 21 - 10) / 10;
          const base = ability + variation + (semester === 2 ? 0.2 : 0);
          const types = roster.year === YEARS[2] ? [['TX', 1], ['TX', 2], ['GK', 0]] : [['TX', 1], ['TX', 2], ['TX', 3], ['GK', 0], ['CK', 0]];
          for (const [scoreType, orderNo] of types) {
            const drift = (hashNumber(`${student.student_code}-${subjectId}-${semester}-${scoreType}-${orderNo}`) % 11 - 5) / 10;
            scoreRows.push({ student_id: student.student_id, subject_id: subjectId, year_id: year.year_id, semester,
              score_type: scoreType, score_value: clamp(base + drift), order_no: orderNo, created_by: teacherId });
          }
        }
      }
    }
  }
  const enrollmentRows = rosters.flatMap(roster => roster.students.map(student => ({
    student_id: student.student_id, class_instance_id: getClass(roster.year, roster.grade, roster.code).class_instance_id,
    year_id: yearByName.get(roster.year).year_id,
  })));
  const currentClassByStudent = new Map(enrollmentRows.map(row => [row.student_id, row.class_instance_id]));
  const originalGrade12Ids = rosters.filter(r => r.year === YEARS[0] && r.grade === 12).flatMap(r => r.students.map(s => s.student_id));
  const nextGrade12Ids = rosters.filter(r => r.year === YEARS[1] && r.grade === 12).flatMap(r => r.students.map(s => s.student_id));
  await prisma.$transaction(async tx => {
    await tx.studentParent.deleteMany({ where: { student_id: { in: redundantIds } } });
    await tx.score.deleteMany({ where: { student_id: { in: redundantIds } } });
    await tx.conduct.deleteMany({ where: { student_id: { in: redundantIds } } });
    await tx.student.deleteMany({ where: { student_id: { in: redundantIds } } });
    await tx.parent.deleteMany({ where: { parent_id: { in: parentIds } } });
    await tx.user.deleteMany({ where: { user_id: { in: [...redundant.map(item => item.user_id), ...parentUserIds] } } });
    await tx.studentEnrollment.createMany({ data: enrollmentRows, skipDuplicates: true });
    for (const [studentId, classId] of currentClassByStudent) {
      await tx.student.update({ where: { student_id: studentId }, data: { class_instance_id: classId } });
    }
    await tx.student.updateMany({ where: { student_id: { in: originalGrade12Ids } }, data: { graduated_at: new Date('2025-05-31T00:00:00Z') } });
    await tx.student.updateMany({ where: { student_id: { in: nextGrade12Ids } }, data: { graduated_at: new Date('2026-05-31T00:00:00Z') } });
    for (let index = 0; index < scoreRows.length; index += 500) await tx.score.createMany({ data: scoreRows.slice(index, index + 500), skipDuplicates: true });
    await tx.conduct.createMany({ data: conductRows, skipDuplicates: true });
  }, { timeout: 120000 });
  console.log(`Đã chuyển ${enrollmentRows.length} lượt xếp lớp, thay ${redundant.length} hồ sơ mẫu trùng, ghi ${scoreRows.length} điểm và ${conductRows.length} hạnh kiểm; 60 học sinh tốt nghiệp.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
