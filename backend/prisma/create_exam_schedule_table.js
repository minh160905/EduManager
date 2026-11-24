require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const createTableSql = `
  CREATE TABLE IF NOT EXISTS exam_schedules (
    exam_schedule_id INT NOT NULL AUTO_INCREMENT,
    teacher_id INT NOT NULL,
    class_instance_id INT NOT NULL,
    subject_id INT NOT NULL,
    exam_type ENUM('MIDTERM', 'FINAL') NOT NULL,
    exam_date DATE NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (exam_schedule_id),
    UNIQUE INDEX exam_schedules_class_date_start_key (class_instance_id, exam_date, start_time),
    INDEX exam_schedules_teacher_date_idx (teacher_id, exam_date),
    INDEX exam_schedules_class_date_idx (class_instance_id, exam_date),
    INDEX exam_schedules_subject_id_idx (subject_id),
    CONSTRAINT exam_schedules_teacher_id_fkey
      FOREIGN KEY (teacher_id) REFERENCES users(user_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT exam_schedules_class_instance_id_fkey
      FOREIGN KEY (class_instance_id) REFERENCES class_instances(class_instance_id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT exam_schedules_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES subjects(subject_id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`;

async function main() {
  await prisma.$executeRawUnsafe(createTableSql);

  const columns = await prisma.$queryRaw`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_schedules'
    ORDER BY ORDINAL_POSITION
  `;

  if (columns.length !== 10) {
    throw new Error(`Bảng exam_schedules có cấu trúc không đầy đủ: tìm thấy ${columns.length}/10 cột`);
  }

  const indexes = await prisma.$queryRaw`
    SELECT DISTINCT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_schedules'
  `;
  const foreignKeys = await prisma.$queryRaw`
    SELECT CONSTRAINT_NAME
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_schedules'
  `;

  if (indexes.length < 5 || foreignKeys.length !== 3) {
    throw new Error(`Bảng exam_schedules thiếu index hoặc khóa ngoại (${indexes.length} index, ${foreignKeys.length} khóa ngoại)`);
  }

  console.log(`✅ Bảng exam_schedules đã sẵn sàng: ${columns.length} cột, ${indexes.length} index, ${foreignKeys.length} khóa ngoại.`);
}

main()
  .catch((error) => {
    console.error('❌ Không thể tạo bảng exam_schedules:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
