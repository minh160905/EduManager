import { useState } from 'react';
import { Tag, Modal, Input, Select, App } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { examsApi, schedulesApi, lessonNotesApi } from '../../api';
import TimetableGrid from '../../components/common/TimetableGrid';
import WeekNavigator from '../../components/common/WeekNavigator';
import {
  filterSchedulesForWeek,
  getDefaultScheduleDate,
  getSchoolWeekEnd,
  getWeekStart,
} from '../../utils/scheduleWeek';

export default function StudentSchedulePage() {
  const [selectedDate, setSelectedDate] = useState(null);
  const [editor, setEditor] = useState(null);
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['student-schedule'],
    queryFn: () => schedulesApi.getStudentSchedule().then(r => r.data.data),
  });

  const displayedDate = selectedDate || getDefaultScheduleDate(schedules);
  const weekStart = getWeekStart(displayedDate);
  const weekEnd = getSchoolWeekEnd(weekStart);
  const weeklySchedules = filterSchedulesForWeek(schedules, weekStart);
  const classInfo = weeklySchedules[0]?.class_instance;
  const classLabel = classInfo ? `Lớp ${classInfo.grade}${classInfo.class?.class_code} – ${classInfo.year?.name}` : '';
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekEnd.format('YYYY-MM-DD');
  const { data: notes = [], isError: notesError, isLoading: notesLoading } = useQuery({
    queryKey: ['lesson-notes', from, to],
    queryFn: () => lessonNotesApi.getAll({ from, to }).then(r => r.data.data),
  });
  const saveNote = useMutation({
    mutationFn: lessonNotesApi.save,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson-notes'] }); setEditor(null); message.success('Đã lưu ghi chú'); },
    onError: (error) => message.error(error.response?.data?.message || 'Không thể lưu ghi chú'),
  });
  const openNote = (lesson, date) => {
    const existing = notes.find(note => note.schedule_id === lesson.schedule_id && note.lesson_date.slice(0, 10) === date);
    setEditor({ lesson, date, content: existing?.content || '', completed: existing?.completed || false });
  };
  const { data: exams = [], isLoading: examsLoading } = useQuery({
    queryKey: ['student-exams', weekStart.format('YYYY-MM-DD'), weekEnd.format('YYYY-MM-DD')],
    queryFn: () => examsApi.getForStudent({
      from: weekStart.format('YYYY-MM-DD'),
      to: weekEnd.format('YYYY-MM-DD'),
    }).then(r => r.data.data),
    refetchInterval: 30000,
  });

  return (
    <div>
      <div className="page-header">
        <h1>Thời khoá biểu</h1>
        <p>Chọn tiết học để thêm ghi chú và theo dõi việc hoàn thành.</p>
      </div>

      {classLabel && (
        <div style={{ marginBottom: 16 }}>
          <Tag color="purple" style={{ fontSize: 14, fontWeight: 700, borderRadius: 8, padding: '4px 14px' }}>
            {classLabel}
          </Tag>
          <Tag color="default" style={{ borderRadius: 8 }}>{weeklySchedules.length} tiết/tuần</Tag>
        </div>
      )}

      <WeekNavigator value={displayedDate} onChange={setSelectedDate} schedules={schedules} />
      {notesError && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>Không thể tải ghi chú. Vui lòng thử lại.</p>}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <TimetableGrid
          schedules={weeklySchedules}
          exams={exams}
          loading={isLoading || examsLoading}
          showTeacher
          weekStart={weekStart}
          lessonNotes={notes}
          onLessonClick={!notesError && !notesLoading ? openNote : null}
          emptyDescription="Không có thời khóa biểu trong tuần đã chọn"
        />
      </div>
      <Modal
        open={!!editor}
        title={editor ? `Ghi chú: ${editor.lesson.subject?.subject_name} — ${editor.date.split('-').reverse().join('/')}` : 'Ghi chú tiết học'}
        onCancel={() => setEditor(null)}
        onOk={() => saveNote.mutate({ schedule_id: editor.lesson.schedule_id, lesson_date: editor.date, content: editor.content, completed: editor.completed })}
        okText="Lưu ghi chú" cancelText="Hủy"
        okButtonProps={{ disabled: !editor?.content.trim(), loading: saveNote.isPending }}
      >
        {editor && <div style={{ display: 'grid', gap: 12, paddingTop: 16 }}>
          <label htmlFor="lesson-note-content">Nội dung</label>
          <Input.TextArea id="lesson-note-content" rows={4} maxLength={2000} showCount value={editor.content}
            onChange={event => setEditor({ ...editor, content: event.target.value })} placeholder="Nhập nội dung cần hoàn thành" />
          <label htmlFor="lesson-note-status">Trạng thái</label>
          <Select id="lesson-note-status" value={editor.completed} onChange={completed => setEditor({ ...editor, completed })}
            options={[{ value: false, label: 'Chưa hoàn thành' }, { value: true, label: 'Đã hoàn thành' }]} />
        </div>}
      </Modal>
    </div>
  );
}
