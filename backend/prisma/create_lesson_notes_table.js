require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lesson_notes (
      note_id INT NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      schedule_id INT NOT NULL,
      lesson_date DATE NOT NULL,
      content TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      reminded_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (note_id),
      UNIQUE KEY lesson_notes_student_schedule_date_key (student_id, schedule_id, lesson_date),
      KEY lesson_notes_reminder_idx (lesson_date, completed, reminded_at),
      KEY lesson_notes_schedule_id_idx (schedule_id),
      CONSTRAINT lesson_notes_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT lesson_notes_schedule_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log('Bảng lesson_notes đã sẵn sàng.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
