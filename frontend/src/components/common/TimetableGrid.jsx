import React from 'react';
import { Tooltip, Spin, Empty } from 'antd';
import dayjs from 'dayjs';
import { getWeekStart } from '../../utils/scheduleWeek';

const DAYS = [
  { value: 2, label: 'Thứ Hai' },
  { value: 3, label: 'Thứ Ba' },
  { value: 4, label: 'Thứ Tư' },
  { value: 5, label: 'Thứ Năm' },
  { value: 6, label: 'Thứ Sáu' },
  { value: 7, label: 'Thứ Bảy' },
];

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const PERIOD_TIMES = {
  1: { start: '07:00', end: '07:45' }, 2: { start: '07:50', end: '08:35' }, 3: { start: '08:45', end: '09:30' },
  4: { start: '09:40', end: '10:25' }, 5: { start: '10:30', end: '11:15' },
  6: { start: '13:00', end: '13:45' }, 7: { start: '13:50', end: '14:35' }, 8: { start: '14:45', end: '15:30' },
  9: { start: '15:40', end: '16:25' }, 10: { start: '16:30', end: '17:15' },
};

const LESSON_STYLE = { bg: 'var(--bg-subtle)', border: 'var(--border)', text: 'var(--text-primary)' };

export default function TimetableGrid({
  schedules = [],
  showTeacher = true,
  showClass = false,
  loading = false,
  onCellClick = null,
  highlightTeacherId = null,
  onLessonClick = null,
  weekStart = null,
  emptyDescription = 'Chưa có thời khoá biểu',
  exams = [],
}) {
  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!schedules.length && !exams.length && !onCellClick) return <Empty description={<span style={{ color: 'var(--text-muted)' }}>{emptyDescription}</span>} style={{ padding: 40 }} />;

  const map = {};
  for (const s of schedules) map[`${s.day_of_week}-${s.period}`] = s;

  const hasSaturday = schedules.some(s => s.day_of_week === 7);
  const usedDays = weekStart ? DAYS : DAYS.filter(d => d.value <= 6 || (d.value === 7 && hasSaturday));
  const maxPeriod = Math.max(...schedules.map(s => s.period), 6);
  const usedPeriods = PERIODS.filter(p => p <= maxPeriod);
  const isEditable = typeof onCellClick === 'function';
  const monday = weekStart ? getWeekStart(weekStart) : null;
  const examsByDate = exams.reduce((result, exam) => {
    const key = dayjs(exam.exam_date).format('YYYY-MM-DD');
    if (!result[key]) result[key] = [];
    result[key].push(exam);
    return result;
  }, {});
  const hasExams = exams.length > 0 && monday;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 850, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 100, background: 'var(--bg-page)' }}>Tiết</th>
            {usedDays.map(d => {
              const date = weekStart ? getWeekStart(weekStart).add(d.value - 2, 'day') : null;
              const isToday = date?.isSame(dayjs(), 'day');
              return (
                <th key={d.value} style={{ ...TH, background: isToday ? 'var(--primary-soft)' : 'var(--bg-page)', minWidth: 140 }}>
                  <div style={{ color: isToday ? 'var(--primary)' : 'var(--text-primary)', fontWeight: 700 }}>{d.label}</div>
                  {date && (
                    <div style={{ color: isToday ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                      {date.format('DD/MM/YYYY')}
                      {isToday && <span style={{ marginLeft: 4, fontWeight: 700 }}>• Hôm nay</span>}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {hasExams && (
            <tr>
              <td style={{ ...TD, background: 'var(--warning-soft)', padding: 8, textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ color: 'var(--warning)', fontWeight: 800, fontSize: 12 }}>LỊCH</div>
                <div style={{ color: 'var(--warning)', fontWeight: 800, fontSize: 12 }}>KIỂM TRA</div>
              </td>
              {usedDays.map((day) => {
                const dateKey = monday.add(day.value - 2, 'day').format('YYYY-MM-DD');
                const dayExams = examsByDate[dateKey] || [];
                return (
                  <td key={day.value} style={{ ...TD, padding: 6, background: dayExams.length ? 'var(--warning-soft)' : 'var(--bg-card)' }}>
                    {dayExams.map((exam) => (
                      <div key={exam.exam_schedule_id} style={EXAM_CARD}>
                        <div style={{ color: 'var(--warning)', fontSize: 11, fontWeight: 800 }}>
                          {exam.exam_type === 'MIDTERM' ? 'KIỂM TRA GIỮA KỲ' : 'KIỂM TRA HỌC KỲ'}
                        </div>
                        <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                          {exam.subject?.subject_name}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                          {exam.start_time} – {exam.end_time}
                        </div>
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          )}
          {usedPeriods.map((period, pi) => (
            <React.Fragment key={period}>
              {period === 1 && (
                <tr>
                  <td colSpan={usedDays.length + 1} style={SESSION_DIV}>
                    Buổi sáng
                  </td>
                </tr>
              )}
              {period === 6 && (
                <tr>
                  <td colSpan={usedDays.length + 1} style={SESSION_DIV}>
                    Buổi chiều
                  </td>
                </tr>
              )}
              <tr style={{ background: pi % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-hover)' }}>
                {/* Period label */}
                <td style={{ ...TD, background: 'var(--bg-page)', textAlign: 'center', verticalAlign: 'middle' }}>
                  <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14 }}>Tiết {period}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 3 }}>
                    <div>{PERIOD_TIMES[period].start} – {PERIOD_TIMES[period].end}</div>
                  </div>
                </td>

                {usedDays.map(d => {
                  const cell = map[`${d.value}-${period}`];
                  const clr = cell ? LESSON_STYLE : null;
                  const isMyLesson = highlightTeacherId && cell?.teacher_id === highlightTeacherId;

                  return (
                    <td key={d.value} style={{
                      ...TD, padding: 6,
                      cursor: isEditable ? 'pointer' : (onLessonClick && cell ? 'pointer' : 'default'),
                      transition: 'background 0.15s',
                      background: isMyLesson ? 'var(--primary-soft)' : undefined,
                    }}
                      onClick={() => {
                        if (isEditable) {
                          onCellClick(d.value, period, cell);
                        } else if (onLessonClick && cell) {
                          onLessonClick(cell);
                        }
                      }}
                      onMouseEnter={e => { if (isEditable || (onLessonClick && cell)) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                      onMouseLeave={e => { if (isEditable || (onLessonClick && cell)) e.currentTarget.style.background = isMyLesson ? 'var(--primary-soft)' : ''; }}
                    >
                      {cell ? (
                        <Tooltip title={`${cell.subject?.subject_name} · GV: ${cell.teacher?.full_name} · ${PERIOD_TIMES[period].start}–${PERIOD_TIMES[period].end}`}>
                          <div style={{
                            background: clr.bg,
                            border: `1px solid ${clr.border}`,
                            borderRadius: 10, padding: '7px 10px',
                            minHeight: 56, display: 'flex', flexDirection: 'column', gap: 3,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          }}>
                            <div style={{ color: clr.text, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {cell.subject?.subject_name}
                            </div>
                            {showTeacher && (
                              <div style={{ color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {cell.teacher?.full_name}
                              </div>
                            )}
                            {showClass && cell.class_instance && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                Lớp {cell.class_instance.grade}{cell.class_instance.class?.class_code}
                              </div>
                            )}
                            {cell.room && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                {cell.room}
                              </div>
                            )}
                          </div>
                        </Tooltip>
                      ) : (
                        isEditable ? (
                          <div style={{
                            border: '2px dashed var(--border)',
                            borderRadius: 10, padding: 6,
                            minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)', fontSize: 11, transition: 'border-color 0.15s',
                          }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                          >
                            Thêm tiết
                          </div>
                        ) : (
                          <div style={{ minHeight: 44 }} />
                        )
                      )}
                    </td>
                  );
                })}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TH = {
  padding: '10px 8px', textAlign: 'center',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)', fontWeight: 700,
  position: 'sticky', top: 0, zIndex: 1,
};

const TD = {
  border: '1px solid var(--border-soft)',
  verticalAlign: 'top',
};

const SESSION_DIV = {
  background: 'var(--bg-page)', padding: '6px 14px',
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)',
};

const EXAM_CARD = {
  background: 'var(--warning-soft)',
  border: '1px solid var(--warning)',
  borderLeft: '3px solid var(--warning)',
  borderRadius: 9,
  padding: '7px 8px',
  marginBottom: 4,
  boxShadow: '0 1px 3px rgba(154,52,18,0.08)',
};
