const prisma = require('../../config/prisma');
const exams = require('../exams/exams.service');

const fold = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const dateOnly = date => new Date(date).toISOString().slice(0, 10);
const displayDate = date => dateOnly(date).split('-').reverse().join('/');
const result = (answer, route) => ({ answer, route, sources: [], mode: 'live_data' });
const PERIOD_TIMES = {
  1: '07:00–07:45', 2: '07:50–08:35', 3: '08:45–09:30', 4: '09:40–10:25', 5: '10:30–11:15',
  6: '13:00–13:45', 7: '13:50–14:35', 8: '14:45–15:30', 9: '15:40–16:25', 10: '16:30–17:15',
};
const DAY_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const yearContains = (year, date) => year && dateOnly(year.start_date) <= date && date <= dateOnly(year.end_date);
const hasPhrase = (text, phrase) => new RegExp(`(?:^|[^a-z])${fold(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z])`).test(fold(text));

function localDate(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function requestedDates(question) {
  const normalized = fold(question);
  const written = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (written) {
    const candidate = `${written[3]}-${written[2].padStart(2, '0')}-${written[1].padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) && displayDate(candidate) === `${written[1].padStart(2, '0')}/${written[2].padStart(2, '0')}/${written[3]}`) return [candidate];
    return [];
  }
  if (normalized.includes('ngay mai')) return [localDate(1)];
  if (normalized.includes('hom nay')) return [localDate()];
  const today = localDate();
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((day + 6) % 7) + (normalized.includes('tuan sau') ? 7 : normalized.includes('tuan truoc') ? -7 : 0));
  const weekdays = ['thu hai', 'thu ba', 'thu tu', 'thu nam', 'thu sau', 'thu bay'];
  const specified = weekdays.findIndex(name => normalized.includes(name));
  return specified >= 0 ? [addDays(monday, specified)] : weekdays.map((_, index) => addDays(monday, index));
}

async function visibleStudent(question, role, userId, db) {
  const select = {
    student_id: true,
    class_instance_id: true,
    class_instance: { select: { year_id: true, year: { select: { start_date: true, end_date: true, name: true } } } },
    enrollments: { select: { class_instance_id: true, year: { select: { year_id: true, name: true, start_date: true, end_date: true } } } },
    user: { select: { full_name: true } },
  };
  if (role === 'STUDENT') {
    const student = await db.student.findUnique({ where: { user_id: Number(userId) }, select });
    return { student };
  }
  if (role !== 'PARENT') return { error: 'Chỉ học sinh và phụ huynh được tra cứu dữ liệu điểm, lịch học cá nhân qua chatbot.' };
  const parent = await db.parent.findUnique({
    where: { user_id: Number(userId) },
    select: { students: { select: { student: { select } } } },
  });
  const children = (parent?.students || []).map(link => link.student);
  if (!children.length) return { error: 'Tài khoản chưa liên kết với học sinh nào.' };
  if (children.length === 1) return { student: children[0] };
  const matches = children.filter(child => child.user?.full_name && fold(question).includes(fold(child.user.full_name)));
  if (matches.length === 1) return { student: matches[0] };
  return { error: 'Tài khoản liên kết với nhiều học sinh. Vui lòng nêu đầy đủ tên con trong câu hỏi.' };
}

async function personalScores(question, role, userId, db) {
  const route = role === 'PARENT' ? '/parent/report' : '/student/report';
  const { student, error } = await visibleStudent(question, role, userId, db);
  if (error) return result(error, route);
  if (!student) return result('Không tìm thấy hồ sơ học sinh của tài khoản này.', route);
  if (!student.class_instance?.year_id && !student.enrollments?.length) return result('Học sinh chưa được liên kết với lớp và năm học có điểm.', route);
  const requestedYear = fold(question).match(/20\d{2}[-–/]20\d{2}/)?.[0].replace(/[–/]/g, '-');
  const selectedYear = requestedYear
    ? student.enrollments?.find(item => item.year.name.replace(/[–/]/g, '-') === requestedYear)?.year
      || (student.class_instance?.year?.name === requestedYear ? student.class_instance.year : null)
    : student.enrollments?.find(item => yearContains(item.year, localDate()))?.year || student.class_instance?.year;
  if (requestedYear && !selectedYear) return result(`Tài khoản chưa có điểm cho năm học ${requestedYear} trong hệ thống.`, route);
  if (/hien tai|nam nay/.test(fold(question)) && !yearContains(selectedYear, localDate())) {
    return result('Tài khoản chưa có lớp và điểm cho năm học hiện tại trong hệ thống.', route);
  }
  const where = { student_id: student.student_id };
  const selectedYearId = selectedYear?.year_id || (selectedYear === student.class_instance?.year ? student.class_instance.year_id : null);
  if (selectedYearId) where.year_id = selectedYearId;
  const normalized = fold(question);
  const sem = normalized.match(/(?:hoc ky|hoc ki|hk|ky|ki)\s*(1|2|ii|i)\b/);
  if (sem) where.semester = sem[1] === '2' || sem[1] === 'ii' ? 2 : 1;
  const scores = await db.score.findMany({
    where,
    select: { semester: true, score_type: true, score_value: true, order_no: true, subject: { select: { subject_name: true } } },
    orderBy: [{ semester: 'asc' }, { subject: { subject_name: 'asc' } }, { order_no: 'asc' }],
  });
  if (!scores.length) return result('Hệ thống chưa có điểm phù hợp với năm học và học kỳ được hỏi.', route);
  const subjects = [...new Set(scores.map(score => score.subject.subject_name))];
  const named = subjects.filter(name => hasPhrase(normalized, name));
  const selected = named.length ? scores.filter(score => named.includes(score.subject.subject_name)) : scores;
  const groups = new Map();
  for (const score of selected) {
    const key = `${score.semester}|${score.subject.subject_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(score);
  }
  const lines = [...groups].map(([key, values]) => {
    const [semester, subject] = key.split('|');
    const formatted = values.map(value => `${value.score_type === 'TX' ? `TX${value.order_no || ''}` : value.score_type === 'GK' ? 'Giữa kỳ' : 'Cuối kỳ'} ${value.score_value}`);
    return `${subject}, học kỳ ${semester}: ${formatted.join('; ')}.`;
  });
  const label = `năm học ${selectedYear.name}`;
  const archival = yearContains(selectedYear, localDate()) ? '' : 'Dữ liệu lưu trữ: ';
  const owner = role === 'PARENT' ? ` của ${student.user.full_name}` : '';
  return result(`${archival}Điểm thành phần${owner} ${label} theo dữ liệu hệ thống:\n${lines.join('\n')}`, route);
}

async function personalSchedule(question, role, userId, db) {
  const route = role === 'PARENT' ? '/parent/schedule' : role === 'STUDENT' ? '/student/schedule' : '/teacher/schedule';
  const dates = requestedDates(question);
  if (!dates.length) return result('Ngày được hỏi không hợp lệ. Vui lòng nhập ngày theo dạng DD/MM/YYYY.', route);
  let where;
  if (role === 'STUDENT' || role === 'PARENT') {
    const { student, error } = await visibleStudent(question, role, userId, db);
    if (error) return result(error, route);
    if (!student?.class_instance_id && !student?.enrollments?.length) return result('Tài khoản chưa được liên kết với lớp học.', route);
    const classIds = student.enrollments?.length
      ? student.enrollments.filter(item => dates.some(date => yearContains(item.year, date))).map(item => item.class_instance_id)
      : [student.class_instance_id];
    where = { class_instance_id: classIds.length === 1 ? classIds[0] : { in: classIds } };
  } else if (['TEACHER', 'HEAD_OF_DEPARTMENT', 'PRINCIPAL'].includes(role)) {
    where = { teacher_id: Number(userId) };
  } else {
    return result('Vai trò này chưa hỗ trợ tra cứu thời khóa biểu cá nhân qua chatbot.');
  }
  const lessons = await db.schedule.findMany({
    where: { ...where, day_of_week: { in: [...new Set(dates.map(date => new Date(`${date}T00:00:00Z`).getUTCDay() + 1))] } },
    select: {
      day_of_week: true, period: true, room: true,
      subject: { select: { subject_name: true } },
      teacher: { select: { full_name: true } },
      class_instance: { select: { grade: true, class: { select: { class_code: true } }, year: { select: { start_date: true, end_date: true } } } },
    },
    orderBy: [{ day_of_week: 'asc' }, { period: 'asc' }],
  });
  const lines = [];
  for (const date of dates) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const onDay = lessons.filter(lesson => lesson.day_of_week === dow + 1
      && yearContains(lesson.class_instance.year, date));
    if (!onDay.length) continue;
    const details = onDay.map(lesson => {
      const className = role === 'STUDENT' || role === 'PARENT' ? '' : `, lớp ${lesson.class_instance.grade}${lesson.class_instance.class.class_code}`;
      const teacher = role === 'TEACHER' || role === 'HEAD_OF_DEPARTMENT' || role === 'PRINCIPAL' ? '' : `, GV ${lesson.teacher.full_name || 'chưa rõ'}`;
      return `tiết ${lesson.period} (${PERIOD_TIMES[lesson.period] || 'chưa có giờ'}) ${lesson.subject.subject_name}${className}${teacher}${lesson.room ? `, phòng ${lesson.room}` : ''}`;
    });
    lines.push(`${DAY_NAMES[dow]} ${displayDate(date)}: ${details.join('; ')}.`);
  }
  return result(lines.length ? `Thời khóa biểu theo dữ liệu hệ thống:\n${lines.join('\n')}` : 'Không có tiết học trong thời gian được hỏi hoặc thời gian nằm ngoài năm học.', route);
}

async function academicYear(question, db) {
  const years = await db.academicYear.findMany({
    orderBy: { start_date: 'desc' }, take: 20,
    select: { name: true, start_date: true, end_date: true },
  });
  const requested = fold(question).match(/20\d{2}[-–/]20\d{2}/)?.[0].replace(/[–/]/g, '-');
  const current = localDate();
  const year = requested
    ? years.find(item => fold(item.name).replace(/[–/]/g, '-') === requested)
    : years.find(item => dateOnly(item.start_date) <= current && dateOnly(item.end_date) >= current);
  if (!year) return result('Chưa tìm thấy năm học tương ứng trong cơ sở dữ liệu.');
  return result(`Theo dữ liệu năm học ${year.name} của hệ thống: bắt đầu ${displayDate(year.start_date)}, kết thúc ${displayDate(year.end_date)}. Các mốc như nghỉ lễ và lịch kiểm tra cần xem lịch do trường công bố.`);
}

const teacherSelect = { full_name: true, phone: true, email: true, status: true };
const classSelect = {
  grade: true,
  class: { select: { class_code: true } },
  year: { select: { name: true, start_date: true, end_date: true } },
  homeroom_teacher: { select: teacherSelect },
  teacher_assignments: {
    select: {
      teacher: { select: teacherSelect },
      subject: { select: { subject_name: true } },
    },
  },
};

async function teacherContacts(question, role, userId, db) {
  if (!['STUDENT', 'PARENT'].includes(role) || !userId) {
    return result('Chức năng tra cứu liên hệ giáo viên hiện chỉ hỗ trợ học sinh và phụ huynh trong lớp được liên kết.');
  }
  let classes;
  if (role === 'STUDENT') {
    const student = await db.student.findUnique({
      where: { user_id: Number(userId) },
      select: { class_instance: { select: classSelect } },
    });
    classes = student?.class_instance ? [student.class_instance] : [];
  } else {
    const parent = await db.parent.findUnique({
      where: { user_id: Number(userId) },
      select: { students: { select: { student: { select: { class_instance: { select: classSelect } } } } } },
    });
    classes = (parent?.students || []).map(link => link.student.class_instance).filter(Boolean);
  }
  if (!classes.length) return result('Tài khoản chưa được liên kết với lớp học nào.');

  const normalized = fold(question);
  const lines = [];
  for (const item of classes) {
    if (!yearContains(item.year, localDate())) continue;
    const label = `${item.grade}${item.class.class_code}`;
    const subjectMatches = item.teacher_assignments.filter(assignment =>
      hasPhrase(normalized, assignment.subject.subject_name));
    if (!subjectMatches.length && !/chu nhiem|gvcn/.test(normalized)) continue;
    const teachers = subjectMatches.length
      ? subjectMatches.map(assignment => ({ teacher: assignment.teacher, label: `giáo viên ${assignment.subject.subject_name}` }))
      : [{ teacher: item.homeroom_teacher, label: 'giáo viên chủ nhiệm' }];
    for (const entry of teachers) {
      if (!entry.teacher || entry.teacher.status !== 'ACTIVE') continue;
      const contact = [entry.teacher.phone && `điện thoại ${entry.teacher.phone}`, entry.teacher.email && `email ${entry.teacher.email}`].filter(Boolean);
      lines.push(`Lớp ${label}, ${entry.label} ${entry.teacher.full_name || ''}: ${contact.join(', ') || 'chưa có thông tin liên hệ'}.`);
    }
  }
  return result(lines.length ? [...new Set(lines)].join('\n') : 'Chưa tìm thấy giáo viên phù hợp thuộc lớp của năm học hiện tại. Vui lòng kiểm tra phân công và liên kết lớp.');
}

async function studentExams(question, userId, db, examService) {
  const dates = requestedDates(question);
  if (!dates.length) return result('Ngày được hỏi không hợp lệ. Vui lòng nhập ngày theo dạng DD/MM/YYYY.', '/student/schedule');
  const from = dates[0];
  const to = dates[dates.length - 1];
  const { student } = await visibleStudent(question, 'STUDENT', userId, db);
  if (!dates.some(date => yearContains(student?.class_instance?.year, date)
    || student?.enrollments?.some(item => yearContains(item.year, date)))) {
    return result(`Tài khoản chưa có lớp thuộc năm học của khoảng ${displayDate(from)}–${displayDate(to)} trong hệ thống.`, '/student/schedule');
  }
  const records = await examService.getForStudent(userId, { from, to });
  if (!records.length) return result(`Hệ thống chưa ghi nhận lịch kiểm tra của lớp bạn trong khoảng ${displayDate(from)}–${displayDate(to)}.`, '/student/schedule');
  const lines = records.map(item => {
    const type = item.exam_type === 'MIDTERM' ? 'giữa kỳ' : 'học kỳ';
    return `${displayDate(item.exam_date)}: ${item.subject.subject_name}, kiểm tra ${type}, ${item.start_time}–${item.end_time}.`;
  });
  return result(`Lịch kiểm tra theo dữ liệu hệ thống:\n${lines.join('\n')}`, '/student/schedule');
}

async function getLiveAnswer(question, role, userId, db = prisma, examService = exams) {
  const normalized = fold(question);
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+84|0)\d{9,10}|\bHS\d{3,}\b/i.test(question)) {
    return result('Vui lòng không nhập email, số điện thoại hoặc mã học sinh vào câu hỏi. Hãy dùng màn hình có phân quyền để tra cứu dữ liệu cá nhân.');
  }
  if (/(so dien thoai|email|lien he).*(giao vien|co giao|thay giao|gvcn)|(giao vien|co giao|thay giao|gvcn).*(so dien thoai|email|lien he)/.test(normalized)) {
    return teacherContacts(question, role, userId, db);
  }
  if (/nam hoc.*20\d{2}|20\d{2}.*nam hoc|ngay bat dau nam hoc|ngay ket thuc nam hoc|nam hoc hien tai|nam hoc nay/.test(normalized)
    && !/diem|ket qua hoc tap|hoc ba|thoi khoa bieu|lich hoc|lich day|kiem tra/.test(normalized)) {
    return academicYear(question, db);
  }
  if (role === 'STUDENT' && userId && /kiem tra/.test(normalized)
    && (/ngay mai|hom nay|tuan nay|tuan sau|ngay\s*\d{1,2}\//.test(normalized) || /lich kiem tra/.test(normalized))) {
    return studentExams(question, userId, db, examService);
  }
  const personal = /cua toi|cua em|cua con|lop em|lop toi|ngay mai|hom nay|tuan nay|\blop\s*1[012][a-z0-9]*\b/.test(normalized);
  if (personal && /diem danh|chuyen can|vang hoc/.test(normalized)) {
    return result('Hệ thống hiện chưa có dữ liệu điểm danh hoặc chuyên cần để chatbot tra cứu.');
  }
  const isSchedule = /lich|thoi khoa bieu|kiem tra|thi/.test(normalized);
  const isScore = /diem|ket qua hoc tap|hoc ba/.test(normalized);
  if (personal && isScore && /trung binh|\bdtb\b/.test(normalized)) {
    const route = role === 'PARENT' ? '/parent/report' : role === 'STUDENT' ? '/student/report' : undefined;
    return result('Chatbot hiện hiển thị điểm thành phần từ database. Vui lòng xem bảng điểm để kiểm tra điểm trung bình do ứng dụng tính.', route);
  }
  if (isScore && (personal || /^(diem|ket qua hoc tap|hoc ba)\b/.test(normalized)) && !/cach tinh|quy dinh|cong thuc|loai diem/.test(normalized)) {
    return personalScores(question, role, userId, db);
  }
  if (/thoi khoa bieu|lich hoc|lich day|hom nay.*hoc|ngay mai.*hoc/.test(normalized)
    || (isSchedule && personal && !/kiem tra|thi/.test(normalized))) {
    return personalSchedule(question, role, userId, db);
  }
  if (personal && /hanh kiem|ren luyen|nhan xet/.test(normalized)) {
    const route = role === 'PARENT' ? '/parent/comments' : role === 'STUDENT' ? '/student/comments' : undefined;
    return result('Vui lòng xem mục Nhận xét để tra cứu đánh giá rèn luyện và nhận xét của tài khoản được liên kết.', route);
  }
  if (personal && /thanh tich/.test(normalized)) {
    const route = role === 'PARENT' ? '/parent/achievements' : role === 'STUDENT' ? '/student/achievements' : undefined;
    return result('Vui lòng xem mục Thành tích để tra cứu dữ liệu đã ghi nhận.', route);
  }
  if (personal && /thong bao/.test(normalized)) {
    return result('Vui lòng xem mục Thông báo để tra cứu thông báo dành cho tài khoản của bạn.', '/notifications');
  }
  if (!personal && !/diem.*\bcua\b/.test(normalized)) return null;
  if (!isSchedule && !isScore) {
    if (/cua toi|cua em|cua con|lop em|lop toi|con toi/.test(normalized)) {
      return result('Chatbot chưa hỗ trợ tra cứu loại thông tin cá nhân này. Vui lòng dùng mục có phân quyền trong ứng dụng.');
    }
    return null;
  }
  const routes = {
    STUDENT: { schedule: '/student/schedule', score: '/student/report' },
    PARENT: { schedule: '/parent/schedule', score: '/parent/report' },
    TEACHER: { schedule: '/teacher/schedule' },
    HEAD_OF_DEPARTMENT: { schedule: '/teacher/schedule' },
    PRINCIPAL: { schedule: '/teacher/schedule' },
  };
  const route = routes[role]?.[isSchedule ? 'schedule' : 'score'];
  return result(route
    ? `Thông tin ${isSchedule ? 'lịch học, lịch kiểm tra' : 'điểm số'} cá nhân thay đổi theo dữ liệu hệ thống. Hãy mở mục tương ứng để xem dữ liệu mới nhất của tài khoản bạn.`
    : 'Chatbot hiện chưa hỗ trợ truy vấn dữ liệu cá nhân này. Hãy dùng màn hình nghiệp vụ có phân quyền trong ứng dụng.', route);
}

module.exports = { getLiveAnswer };
