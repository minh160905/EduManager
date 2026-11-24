const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertClassAccess,
  assertStudentAccess,
  getAccessibleClassIds,
} = require('../src/utils/access');

test('school-wide roles bypass educator class checks', async () => {
  const db = {
    classInstance: {
      findFirst: async () => {
        throw new Error('database should not be queried');
      },
    },
  };

  await assert.doesNotReject(() => assertClassAccess({ role: 'ADMIN', userId: 1 }, 99, {}, db));
  await assert.doesNotReject(() => assertClassAccess({ role: 'PRINCIPAL', userId: 2 }, 99, {}, db));
});

test('score access requires the educator assignment for the requested subject', async () => {
  let capturedWhere;
  const db = {
    classInstance: {
      findFirst: async ({ where }) => {
        capturedWhere = where;
        return { class_instance_id: 7 };
      },
    },
  };

  await assertClassAccess(
    { role: 'TEACHER', userId: 12 },
    7,
    { subjectId: 3, assignmentOnly: true },
    db,
  );

  assert.deepEqual(capturedWhere.OR, [
    { teacher_assignments: { some: { teacher_id: 12, subject_id: 3 } } },
  ]);
});

test('an unrelated educator is rejected', async () => {
  const db = { classInstance: { findFirst: async () => null } };
  await assert.rejects(
    () => assertClassAccess({ role: 'TEACHER', userId: 20 }, 7, {}, db),
    (error) => error.statusCode === 403,
  );
});

test('student access resolves the class before checking educator scope', async () => {
  const db = {
    student: {
      findUnique: async () => ({ student_id: 5, class_instance_id: 7 }),
    },
    classInstance: {
      findFirst: async () => ({ class_instance_id: 7 }),
    },
  };

  const student = await assertStudentAccess({ role: 'HEAD_OF_DEPARTMENT', userId: 8 }, 5, {}, db);
  assert.equal(student.class_instance_id, 7);
});

test('accessible class list contains homeroom and teaching relationships', async () => {
  let capturedWhere;
  const db = {
    classInstance: {
      findMany: async ({ where }) => {
        capturedWhere = where;
        return [{ class_instance_id: 2 }, { class_instance_id: 4 }];
      },
    },
  };

  const ids = await getAccessibleClassIds({ role: 'TEACHER', userId: 9 }, db);
  assert.deepEqual(ids, [2, 4]);
  assert.deepEqual(capturedWhere.OR, [
    { homeroom_teacher_id: 9 },
    { teacher_assignments: { some: { teacher_id: 9 } } },
  ]);
});
