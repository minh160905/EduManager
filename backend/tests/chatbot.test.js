const test = require('node:test');
const assert = require('node:assert/strict');
const chatbot = require('../src/modules/chatbot/chatbot.service');
const { getLiveAnswer } = require('../src/modules/chatbot/live-data.service');

test('retrieval finds the relevant school procedure and keeps its draft status', () => {
  const sources = chatbot.search('Quy trình xin nghỉ học của học sinh');
  assert.ok(sources.some(source => source.section.includes('Xin nghỉ học')));
  assert.ok(sources.every(source => source.review_status.includes('draft')));
  assert.ok(sources.every(source => !/^9\.|^10\.|^11\./.test(source.section)));
});

test('personal exam question points only to the authenticated student view', async () => {
  const result = await chatbot.answer('Ngày mai lớp em có kiểm tra không?', 'STUDENT');
  assert.equal(result.mode, 'live_data');
  assert.equal(result.route, '/student/schedule');
  assert.deepEqual(result.sources, []);
});

test('personal contact details are never answered from document snippets', async () => {
  const result = await chatbot.answer('Số điện thoại giáo viên của em là gì?', 'STUDENT');
  assert.equal(result.mode, 'live_data');
  assert.deepEqual(result.sources, []);
});

test('no API key yields an explicit document preview', async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await chatbot.answer('Điều kiện lên lớp là gì?', 'STUDENT');
    assert.equal(result.mode, 'knowledge_preview');
    assert.ok(result.sources.length > 0);
    assert.match(result.answer, /khóa OpenAI API/);
  } finally {
    if (key !== undefined) process.env.OPENAI_API_KEY = key;
  }
});

test('academic year answer reads the database dates', async () => {
  const db = { academicYear: { findMany: async () => [{
    name: '2026-2027', start_date: new Date('2026-09-05T00:00:00Z'),
    end_date: new Date('2027-05-31T00:00:00Z'),
  }] } };
  const answer = await getLiveAnswer('Năm học 2026-2027 bắt đầu khi nào?', 'STUDENT', 12, db);
  assert.equal(answer.mode, 'live_data');
  assert.match(answer.answer, /05\/09\/2026/);
  assert.deepEqual(answer.sources, []);
});

test('student contact lookup is limited to the student class', async () => {
  const db = { student: { findUnique: async query => {
    assert.equal(query.where.user_id, 12);
    return { class_instance: {
      grade: 10, class: { class_code: 'A' },
      year: { name: '2026-2027', start_date: new Date('2026-09-05T00:00:00Z'), end_date: new Date('2027-05-31T00:00:00Z') },
      homeroom_teacher: { full_name: 'Cô Lan', phone: '0900000000', email: null, status: 'ACTIVE' },
      teacher_assignments: [],
    } };
  } } };
  const answer = await getLiveAnswer('Số điện thoại giáo viên chủ nhiệm của em?', 'STUDENT', 12, db);
  assert.match(answer.answer, /Cô Lan/);
  assert.match(answer.answer, /0900000000/);
  assert.deepEqual(answer.sources, []);
});

test('tomorrow exam lookup uses the authenticated student id', async () => {
  const examService = { getForStudent: async (userId, filters) => {
    assert.equal(userId, 12);
    assert.equal(filters.from, filters.to);
    return [{ exam_date: new Date('2026-11-18T00:00:00Z'), subject: { subject_name: 'Toán' }, exam_type: 'MIDTERM', start_time: '08:00', end_time: '09:00' }];
  } };
  const db = { student: { findUnique: async () => ({ class_instance: {
    year: { start_date: new Date('2026-09-05T00:00:00Z'), end_date: new Date('2027-05-31T00:00:00Z') },
  } }) } };
  const answer = await getLiveAnswer('Ngày mai lớp em có kiểm tra không?', 'STUDENT', 12, db, examService);
  assert.match(answer.answer, /Toán, kiểm tra giữa kỳ, 08:00–09:00/);
});

test('score lookup uses only the authenticated student and current class year', async () => {
  const db = {
    student: { findUnique: async query => {
      assert.equal(query.where.user_id, 12);
      return { student_id: 7, class_instance: { year_id: 3, year: {
        name: '2026-2027', start_date: new Date('2026-09-05T00:00:00Z'), end_date: new Date('2027-05-31T00:00:00Z'),
      } } };
    } },
    score: { findMany: async query => {
      assert.deepEqual(query.where, { student_id: 7, year_id: 3 });
      return [{ semester: 1, score_type: 'GK', score_value: 8.5, order_no: 0, subject: { subject_name: 'Toán' } }];
    } },
  };
  const answer = await getLiveAnswer('Điểm Toán của em', 'STUDENT', 12, db);
  assert.match(answer.answer, /Toán, học kỳ 1: Giữa kỳ 8.5/);
});

test('schedule lookup uses assigned class and the date within its academic year', async () => {
  const year = { start_date: new Date('2024-09-02T00:00:00Z'), end_date: new Date('2025-05-31T00:00:00Z') };
  const db = {
    student: { findUnique: async query => {
      assert.equal(query.where.user_id, 12);
      return { class_instance_id: 5, class_instance: { year_id: 1, year } };
    } },
    schedule: { findMany: async query => {
      assert.equal(query.where.class_instance_id, 5);
      assert.deepEqual(query.where.day_of_week.in, [3]);
      return [{ day_of_week: 3, period: 1, room: 'A1', subject: { subject_name: 'Toán' },
        teacher: { full_name: 'Cô Lan' }, class_instance: { year, grade: 10, class: { class_code: 'A' } } }];
    } },
  };
  const answer = await getLiveAnswer('Lịch học ngày 05/11/2024 của em', 'STUDENT', 12, db);
  assert.match(answer.answer, /Thứ Ba 05\/11\/2024: tiết 1 \(07:00–07:45\) Toán/);
});

test('parent score lookup follows the verified parent-child link', async () => {
  const year = { name: '2024-2025', start_date: new Date('2024-09-02T00:00:00Z'), end_date: new Date('2025-05-31T00:00:00Z') };
  const db = {
    parent: { findUnique: async query => {
      assert.equal(query.where.user_id, 44);
      return { students: [{ student: { student_id: 7, class_instance: { year_id: 1, year }, user: { full_name: 'Học sinh A' } } }] };
    } },
    score: { findMany: async query => {
      assert.deepEqual(query.where, { student_id: 7, year_id: 1 });
      return [{ semester: 1, score_type: 'GK', score_value: 8, order_no: 0, subject: { subject_name: 'Toán' } }];
    } },
  };
  const answer = await getLiveAnswer('Điểm Toán của con', 'PARENT', 44, db);
  assert.match(answer.answer, /Điểm thành phần của Học sinh A/);
  assert.match(answer.answer, /Dữ liệu lưu trữ/);
});

test('teacher score question cannot read a student score through chatbot', async () => {
  const answer = await getLiveAnswer('Điểm Toán của học sinh', 'TEACHER', 9, {});
  assert.match(answer.answer, /Chỉ học sinh và phụ huynh/);
});

test('network failure preserves document search results for offline review', async () => {
  const key = process.env.OPENAI_API_KEY;
  const fetch = global.fetch;
  process.env.OPENAI_API_KEY = 'test-only';
  global.fetch = async () => { throw new Error('ENOTFOUND'); };
  try {
    const answer = await chatbot.answer('Quy trình xin nghỉ học như thế nào?', 'STUDENT', 12);
    assert.equal(answer.mode, 'knowledge_preview');
    assert.ok(answer.sources.some(source => source.section.includes('Xin nghỉ học')));
    assert.match(answer.answer, /chưa kết nối được OpenAI API/);
  } finally {
    global.fetch = fetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});

test('exhausted API credits keep the document preview available', async () => {
  const key = process.env.OPENAI_API_KEY;
  const fetch = global.fetch;
  process.env.OPENAI_API_KEY = 'test-only';
  global.fetch = async () => ({
    ok: false, status: 429,
    json: async () => ({ error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } }),
  });
  try {
    const answer = await chatbot.answer('Điều kiện lên lớp là gì?', 'STUDENT', 12);
    assert.equal(answer.mode, 'knowledge_preview');
    assert.match(answer.answer, /hết tín dụng/);
    assert.ok(answer.sources.length);
  } finally {
    global.fetch = fetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
