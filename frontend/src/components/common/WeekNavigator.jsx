import { Button, DatePicker, Tag } from 'antd';
import dayjs from 'dayjs';
import {
  filterSchedulesForWeek,
  getSchoolWeekEnd,
  getWeekAcademicYearLabels,
  getWeekStart,
} from '../../utils/scheduleWeek';

export default function WeekNavigator({ value, onChange, schedules = [] }) {
  const selectedDate = dayjs(value);
  const weekStart = getWeekStart(selectedDate);
  const weekEnd = getSchoolWeekEnd(weekStart);
  const weeklySchedules = filterSchedulesForWeek(schedules, weekStart);
  const academicYearLabels = getWeekAcademicYearLabels(weeklySchedules);

  return (
    <div style={NAVIGATOR_STYLE}>
      <div>
        <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800 }}>
          Tuần {weekStart.format('DD/MM/YYYY')} – {weekEnd.format('DD/MM/YYYY')}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>
          Từ Thứ Hai đến Thứ Bảy
          {academicYearLabels.map((label) => (
            <Tag key={label} color="purple" style={{ marginLeft: 8, marginRight: 0 }}>
              Năm học {label}
            </Tag>
          ))}
          {!academicYearLabels.length && schedules.length > 0 && (
            <Tag color="orange" style={{ marginLeft: 8, marginRight: 0 }}>
              Ngoài thời gian năm học
            </Tag>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={() => onChange(selectedDate.subtract(7, 'day'))}>
          Tuần trước
        </Button>
        <Button onClick={() => onChange(dayjs())}>
          Tuần này
        </Button>
        <DatePicker
          value={selectedDate}
          format="DD/MM/YYYY"
          allowClear={false}
          placeholder="Chọn ngày"
          onChange={(date) => date && onChange(date)}
          style={{ width: 150 }}
        />
        <Button onClick={() => onChange(selectedDate.add(7, 'day'))}>
          Tuần sau
        </Button>
      </div>
    </div>
  );
}

const NAVIGATOR_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  background: 'var(--header-surface)',
  border: '1px solid var(--primary-border)',
  borderRadius: 12,
  padding: '12px 14px',
  marginBottom: 14,
};
