const { test } = require('node:test');
const assert = require('node:assert/strict');
const prismaPath = require.resolve('../src/config/prisma');
const state = { note: null, notifications: [], student: null, schedule: null };
const prisma = {
  student: { findUnique: async () => state.student },
  schedule: { findUnique: async () => state.schedule },
  lessonNote: {
    upsert: async ({ create }) => create,
    findMany: async () => state.note ? [state.note] : [],
  },
  $transaction: async (fn) => fn({
    lessonNote: { updateMany: async () => {
      if (!state.note || state.note.completed || state.note.reminded_at) return { count: 0 };
      state.note.reminded_at = new Date(); return { count: 1 };
    } },
    notification: { create: async ({ data }) => state.notifications.push(data) },
  }),
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const service = require('../src/modules/lesson-notes/lesson-notes.service');

test('validate ownership and the concrete lesson date', async () => {
  state.student = { student_id: 1, user_id: 2, class_instance_id: 3, enrollments: [] };
  state.schedule = { schedule_id: 5, class_instance_id: 3, day_of_week: 2, period: 1,
    class_instance: { year: { start_date: new Date('2026-01-01Z'), end_date: new Date('2026-12-31Z') } } };
  const data = { schedule_id: 5, lesson_date: '2026-11-23', content: 'Làm bài', completed: false };
  assert.equal((await service.save(2, data)).student_id, 1);
  await assert.rejects(service.save(2, { ...data, lesson_date: '2026-11-24' }), e => e.statusCode === 400);
  state.student.class_instance_id = 4;
  await assert.rejects(service.save(2, data), e => e.statusCode === 403);
  assert.throws(() => service.parseDate('2026-02-30'));
});

test('remind only within 24 hours, once, and only when incomplete', async () => {
  state.notifications = [];
  state.note = { note_id: 1, lesson_date: new Date('2026-11-23T00:00:00Z'), content: 'Làm bài', completed: false, reminded_at: null,
    student: { user_id: 2 }, schedule: { period: 1, subject: { subject_name: 'Toán' } } };
  await service.sendDueReminders(new Date('2026-11-21T23:59:00Z'));
  assert.equal(state.notifications.length, 0);
  await service.sendDueReminders(new Date('2026-11-22T00:00:00Z'));
  await service.sendDueReminders(new Date('2026-11-22T01:00:00Z'));
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].receivers.create.user_id, 2);
  state.note = { ...state.note, completed: true, reminded_at: null };
  await service.sendDueReminders(new Date('2026-11-22T01:00:00Z'));
  assert.equal(state.notifications.length, 1);
  state.note = { ...state.note, completed: false, reminded_at: null };
  await service.sendDueReminders(new Date('2026-11-23T00:00:00Z'));
  assert.equal(state.notifications.length, 1);
});
