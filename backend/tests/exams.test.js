const test = require('node:test');
const assert = require('node:assert/strict');

const examsService = require('../src/modules/exams/exams.service');

const assignment = {
  assignment_id: 9,
  teacher_id: 12,
  class_instance_id: 4,
  subject_id: 3,
  subject: { subject_id: 3, subject_name: 'Toán' },
  class_instance: {
    class_instance_id: 4,
    grade: 10,
    class: { class_code: 'A' },
    year: {
      start_date: new Date('2026-08-01T00:00:00.000Z'),
      end_date: new Date('2027-05-31T00:00:00.000Z'),
    },
  },
};

const validInput = {
  assignment_id: 9,
  exam_type: 'MIDTERM',
  exam_date: '2026-11-10',
  start_time: '08:00',
  end_time: '09:00',
};

test('teacher cannot create an exam outside their assignment', async () => {
  const db = {
    teacherAssignment: { findFirst: async () => null },
    examSchedule: {},
  };

  await assert.rejects(
    () => examsService.create(validInput, 99, db),
    (error) => error.statusCode === 403,
  );
});

test('exam end time must be after its start time', async () => {
  await assert.rejects(
    () => examsService.create({ ...validInput, end_time: '07:30' }, 12, {}),
    (error) => error.statusCode === 400,
  );
});

test('overlapping class exam is rejected', async () => {
  const db = {
    teacherAssignment: { findFirst: async () => assignment },
    examSchedule: {
      findMany: async () => [{
        class_instance_id: 4,
        start_time: '08:30',
        end_time: '09:30',
        class_instance: assignment.class_instance,
      }],
    },
  };

  await assert.rejects(
    () => examsService.create(validInput, 12, db),
    (error) => error.statusCode === 409 && error.message.includes('trùng thời gian'),
  );
});

test('valid exam uses class and subject from the verified assignment', async () => {
  let createdData;
  const db = {
    teacherAssignment: { findFirst: async () => assignment },
    examSchedule: {
      findMany: async () => [],
      create: async ({ data }) => {
        createdData = data;
        return { exam_schedule_id: 1, ...data };
      },
    },
  };

  await examsService.create(validInput, 12, db);
  assert.equal(createdData.teacher_id, 12);
  assert.equal(createdData.class_instance_id, 4);
  assert.equal(createdData.subject_id, 3);
  assert.equal(createdData.exam_type, 'MIDTERM');
});

test('student exam lookup is always scoped to their own class', async () => {
  let capturedWhere;
  const db = {
    student: { findUnique: async () => ({ class_instance_id: 4 }) },
    examSchedule: {
      findMany: async ({ where }) => {
        capturedWhere = where;
        return [];
      },
    },
  };

  await examsService.getForStudent(21, { from: '2026-11-09', to: '2026-11-14' }, db);
  assert.equal(capturedWhere.class_instance_id, 4);
  assert.equal(capturedWhere.exam_date.gte.toISOString().slice(0, 10), '2026-11-09');
  assert.equal(capturedWhere.exam_date.lte.toISOString().slice(0, 10), '2026-11-14');
});
