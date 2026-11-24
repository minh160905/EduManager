require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const columns = await prisma.$queryRaw`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'graduated_at'
  `;
  if (!columns.length) await prisma.$executeRawUnsafe('ALTER TABLE students ADD COLUMN graduated_at DATE NULL');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS student_enrollments (
      enrollment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      class_instance_id INT NOT NULL,
      year_id INT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY student_enrollments_student_year_key (student_id, year_id),
      UNIQUE KEY student_enrollments_student_class_key (student_id, class_instance_id),
      INDEX student_enrollments_class_idx (class_instance_id),
      INDEX student_enrollments_year_idx (year_id),
      CONSTRAINT student_enrollments_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT student_enrollments_class_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instances(class_instance_id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT student_enrollments_year_fkey FOREIGN KEY (year_id) REFERENCES academic_years(year_id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  const [table] = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_enrollments'
  `;
  if (Number(table.n) !== 5) throw new Error('Cấu trúc student_enrollments không đúng');
  console.log('Bảng lịch sử xếp lớp và cột tốt nghiệp đã sẵn sàng.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
