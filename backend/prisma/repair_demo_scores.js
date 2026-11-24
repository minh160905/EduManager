/** Remove only duplicate scores created for demo students in the two new years. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PREFIXES = ['DM2526', 'DM2627'];
const INDEX_NAME = 'scores_unique_result';

async function main() {
  const students = await prisma.student.findMany({
    where: { OR: PREFIXES.map(prefix => ({ student_code: { startsWith: prefix } })) },
    select: { student_id: true, student_code: true },
  });
  if (students.length !== 210) throw new Error(`Cần đúng 210 học sinh mẫu; tìm thấy ${students.length}`);
  const years = await prisma.academicYear.findMany({ where: { name: { in: ['2025-2026', '2026-2027'] } } });
  if (years.length !== 2) throw new Error('Thiếu năm học mẫu cần sửa');
  const yearIds = years.map(item => item.year_id);
  const scores = await prisma.score.findMany({
    where: { student_id: { in: students.map(item => item.student_id) }, year_id: { in: yearIds } },
    select: { score_id: true, student_id: true, subject_id: true, year_id: true, semester: true, score_type: true, order_no: true },
    orderBy: { score_id: 'asc' },
  });
  const seen = new Set();
  const duplicateIds = [];
  for (const score of scores) {
    const key = [score.student_id, score.subject_id, score.year_id, score.semester, score.score_type, score.order_no].join(':');
    if (seen.has(key)) duplicateIds.push(score.score_id);
    else seen.add(key);
  }
  console.log(JSON.stringify({ demoStudents: students.length, scoreRows: scores.length, duplicateRows: duplicateIds.length }));
  if (duplicateIds.length) {
    for (let offset = 0; offset < duplicateIds.length; offset += 500) {
      const ids = duplicateIds.slice(offset, offset + 500);
      const histories = await prisma.scoreHistory.count({ where: { score_id: { in: ids } } });
      if (histories) throw new Error('Điểm trùng đã có lịch sử chỉnh sửa; cần xem xét thủ công');
    }
    if (process.argv.includes('--dry-run')) return;
    let removed = 0;
    for (let offset = 0; offset < duplicateIds.length; offset += 500) {
      const ids = duplicateIds.slice(offset, offset + 500);
      removed += (await prisma.score.deleteMany({ where: { score_id: { in: ids } } })).count;
    }
    if (removed !== duplicateIds.length) throw new Error(`Chỉ xóa được ${removed}/${duplicateIds.length} điểm trùng`);
    console.log(`Đã xóa ${removed} điểm trùng chỉ của học sinh mẫu mới.`);
  }
  if (process.argv.includes('--dry-run')) return;
  const indexes = await prisma.$queryRawUnsafe('SHOW INDEX FROM scores');
  if (!indexes.some(item => item.Key_name === INDEX_NAME)) {
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX ${INDEX_NAME} ON scores (student_id, subject_id, year_id, semester, score_type, order_no)`);
    console.log(`Đã tạo unique index ${INDEX_NAME}.`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
