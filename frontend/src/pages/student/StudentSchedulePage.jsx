import { useState } from 'react';
import { Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { examsApi, schedulesApi } from '../../api';
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
        <p>Lịch học của lớp bạn trong tuần</p>
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

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <TimetableGrid
          schedules={weeklySchedules}
          exams={exams}
          loading={isLoading || examsLoading}
          showTeacher
          weekStart={weekStart}
          emptyDescription="Không có thời khóa biểu trong tuần đã chọn"
        />
      </div>
    </div>
  );
}
