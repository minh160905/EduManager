import dayjs from 'dayjs';

export const getWeekStart = (date) => {
  const value = dayjs(date).startOf('day');
  const daysSinceMonday = (value.day() + 6) % 7;
  return value.subtract(daysSinceMonday, 'day');
};

export const getSchoolWeekEnd = (weekStart) => dayjs(weekStart).add(5, 'day');

const getAcademicYearRanges = (schedules) => {
  const ranges = new Map();
  for (const schedule of schedules) {
    const year = schedule.class_instance?.year;
    if (!year?.start_date || !year?.end_date) continue;
    const key = year.year_id ?? `${year.name}-${year.start_date}`;
    if (!ranges.has(key)) {
      ranges.set(key, {
        name: year.name,
        start: dayjs(year.start_date).startOf('day'),
        end: dayjs(year.end_date).startOf('day'),
      });
    }
  }
  return [...ranges.values()];
};

export const getDefaultScheduleDate = (schedules, today = dayjs()) => {
  const ranges = getAcademicYearRanges(schedules);
  const currentRange = ranges.find(
    ({ start, end }) => !today.isBefore(start, 'day') && !today.isAfter(end, 'day'),
  );
  if (currentRange) return today;

  const latestRange = ranges.sort((a, b) => b.start.valueOf() - a.start.valueOf())[0];
  return latestRange?.start ?? today;
};

export const filterSchedulesForWeek = (schedules, weekStart) => {
  const monday = getWeekStart(weekStart);

  return schedules.filter((schedule) => {
    const lessonDate = monday.add(Number(schedule.day_of_week) - 2, 'day');
    const year = schedule.class_instance?.year;
    if (!year?.start_date || !year?.end_date) return true;

    const start = dayjs(year.start_date).startOf('day');
    const end = dayjs(year.end_date).startOf('day');
    return !lessonDate.isBefore(start, 'day') && !lessonDate.isAfter(end, 'day');
  });
};

export const getWeekAcademicYearLabels = (schedules) => [
  ...new Set(schedules.map((item) => item.class_instance?.year?.name).filter(Boolean)),
];
