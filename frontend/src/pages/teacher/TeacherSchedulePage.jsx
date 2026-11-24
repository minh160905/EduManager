import { useState } from 'react';
import {
  Button, DatePicker, Empty, Form, Modal, Popconfirm,
  Select, Spin, Table, Tabs, Tag, TimePicker, message,
} from 'antd';
import {
  CalendarOutlined, FileDoneOutlined,
  PlusOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { classesApi, examsApi, schedulesApi } from '../../api';
import { useAuthStore } from '../../store/auth.store';
import TimetableGrid from '../../components/common/TimetableGrid';
import WeekNavigator from '../../components/common/WeekNavigator';
import {
  filterSchedulesForWeek,
  getDefaultScheduleDate,
  getWeekStart,
} from '../../utils/scheduleWeek';

export default function TeacherSchedulePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [examForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('my-schedule');
  const [selectedDate, setSelectedDate] = useState(null);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [selectedExamAssignmentId, setSelectedExamAssignmentId] = useState(null);

  // Fetch teacher's own teaching schedule
  const { data: schedules = [], isLoading: isLoadingMySchedule } = useQuery({
    queryKey: ['my-schedule'],
    queryFn: () => schedulesApi.getMySchedule().then(r => r.data.data),
  });

  // Fetch homeroom class information
  const { data: homeroomClass, isLoading: isLoadingHomeroomClass } = useQuery({
    queryKey: ['my-homeroom-class'],
    queryFn: () => classesApi.getMyHomeroomClass().then(r => r.data.data),
  });

  const homeroomClassId = homeroomClass?.class_instance_id;

  // Fetch schedule of the homeroom class
  const { data: homeroomSchedules = [], isLoading: isLoadingHomeroomSchedules } = useQuery({
    queryKey: ['class-schedule', homeroomClassId],
    queryFn: () => schedulesApi.getByClass(homeroomClassId).then(r => r.data.data),
    enabled: !!homeroomClassId,
  });

  const { data: examOptions = [], isLoading: isLoadingExamOptions } = useQuery({
    queryKey: ['exam-options'],
    queryFn: () => examsApi.getMyOptions().then(r => r.data.data),
  });

  const { data: myExams = [], isLoading: isLoadingExams } = useQuery({
    queryKey: ['my-exams'],
    queryFn: () => examsApi.getMine().then(r => r.data.data),
  });

  const createExam = useMutation({
    mutationFn: (data) => examsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-exams'] });
      setExamModalOpen(false);
      setSelectedExamAssignmentId(null);
      examForm.resetFields();
      message.success('Đã tạo lịch kiểm tra và cập nhật cho học sinh');
    },
    onError: (error) => message.error(error.response?.data?.message || 'Không thể tạo lịch kiểm tra'),
  });

  const deleteExam = useMutation({
    mutationFn: (id) => examsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-exams'] });
      message.success('Đã xóa lịch kiểm tra');
    },
    onError: (error) => message.error(error.response?.data?.message || 'Không thể xóa lịch kiểm tra'),
  });

  const selectedAssignment = examOptions.find(
    (option) => option.assignment_id === Number(selectedExamAssignmentId),
  );

  const activeScheduleSource = activeTab === 'homeroom-schedule' ? homeroomSchedules : schedules;
  const displayedDate = selectedDate || getDefaultScheduleDate(activeScheduleSource);
  const weekStart = getWeekStart(displayedDate);
  const weeklyTeachingSchedules = filterSchedulesForWeek(schedules, weekStart);
  const weeklyHomeroomSchedules = filterSchedulesForWeek(homeroomSchedules, weekStart);

  // Group by class for stats in the selected week
  const classSet = new Set(weeklyTeachingSchedules.map(s => s.class_instance_id));
  const subjectSet = new Set(weeklyTeachingSchedules.map(s => s.subject_id));

  const submitExam = (values) => {
    createExam.mutate({
      assignment_id: values.assignment_id,
      exam_type: values.exam_type,
      exam_date: values.exam_date.format('YYYY-MM-DD'),
      start_time: values.time_range[0].format('HH:mm'),
      end_time: values.time_range[1].format('HH:mm'),
    });
  };

  const disableExamDate = (current) => {
    if (!current) return false;
    if (current.day() === 0) return true;
    const year = selectedAssignment?.class_instance?.year;
    if (!year?.start_date || !year?.end_date) return false;
    return current.isBefore(dayjs(year.start_date), 'day') || current.isAfter(dayjs(year.end_date), 'day');
  };

  const examColumns = [
    {
      title: 'Ngày kiểm tra',
      dataIndex: 'exam_date',
      width: 180,
      render: (value) => formatExamDate(value),
    },
    {
      title: 'Thời gian',
      width: 130,
      render: (_, record) => <strong>{record.start_time} – {record.end_time}</strong>,
    },
    {
      title: 'Lớp',
      width: 100,
      render: (_, record) => (
        <Tag color="purple">
          {record.class_instance?.grade}{record.class_instance?.class?.class_code}
        </Tag>
      ),
    },
    {
      title: 'Môn học',
      render: (_, record) => record.subject?.subject_name,
    },
    {
      title: 'Loại kiểm tra',
      width: 150,
      render: (_, record) => (
        <Tag color={record.exam_type === 'MIDTERM' ? 'gold' : 'volcano'}>
          {record.exam_type === 'MIDTERM' ? 'Giữa kỳ' : 'Học kỳ'}
        </Tag>
      ),
    },
    {
      title: '',
      width: 70,
      align: 'center',
      render: (_, record) => (
        <Popconfirm
          title="Xóa lịch kiểm tra?"
          description="Lịch này cũng sẽ biến mất khỏi thời khóa biểu của học sinh."
          okText="Xóa"
          cancelText="Hủy"
          onConfirm={() => deleteExam.mutate(record.exam_schedule_id)}
        >
          <Button danger type="text">Xóa</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Thời khóa biểu</h1>
        <p>Xem lịch dạy, lịch lớp chủ nhiệm và lịch kiểm tra.</p>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 20px' }}
        items={[
          {
            key: 'my-schedule',
            label: (
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarOutlined /> Lịch dạy của tôi
              </span>
            ),
            children: (
              <div>
                <WeekNavigator value={displayedDate} onChange={setSelectedDate} schedules={schedules} />

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Tổng tiết dạy/tuần', value: weeklyTeachingSchedules.length, color: 'var(--primary)', bg: 'rgba(79,70,229,0.1)' },
                    { label: 'Số lớp dạy', value: classSet.size, color: 'var(--success)', bg: 'rgba(16,185,129,0.08)' },
                    { label: 'Số môn dạy', value: subjectSet.size, color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)' },
                  ].map((s, i) => (
                    <div key={i} style={{
                      background: s.bg, border: `1px solid color-mix(in srgb, ${s.color} 19%, transparent)`,
                      borderRadius: 12, padding: '14px 18px', textAlign: 'center',
                    }}>
                      <div style={{ color: s.color, fontSize: 28, fontWeight: 800 }}>{s.value}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <TimetableGrid
                    schedules={weeklyTeachingSchedules} loading={isLoadingMySchedule}
                    showTeacher={false} showClass
                    highlightTeacherId={user?.userId}
                    weekStart={weekStart}
                    emptyDescription="Không có lịch dạy trong tuần đã chọn"
                  />
                </div>
              </div>
            )
          },
          {
            key: 'homeroom-schedule',
            label: (
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TeamOutlined /> Thời khóa biểu lớp CN
                {homeroomClass && (
                  <Tag color="purple" style={{ margin: 0, fontSize: 10, borderRadius: 10, marginLeft: 4 }}>
                    {homeroomClass.grade}{homeroomClass.class?.class_code}
                  </Tag>
                )}
              </span>
            ),
            children: isLoadingHomeroomClass ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
            ) : homeroomClass ? (
              <div>
                <WeekNavigator value={displayedDate} onChange={setSelectedDate} schedules={homeroomSchedules} />

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Lớp chủ nhiệm', value: `${homeroomClass.grade}${homeroomClass.class?.class_code}`, color: 'var(--primary)', bg: 'rgba(79,70,229,0.1)' },
                    { label: 'Sĩ số học sinh', value: `${homeroomClass._count?.enrollments || 0} HS`, color: 'var(--success)', bg: 'rgba(16,185,129,0.08)' },
                    { label: 'Số tiết học/tuần', value: `${weeklyHomeroomSchedules.length} tiết`, color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)' },
                  ].map((s, i) => (
                    <div key={i} style={{
                      background: s.bg, border: `1px solid color-mix(in srgb, ${s.color} 19%, transparent)`,
                      borderRadius: 12, padding: '14px 18px', textAlign: 'center',
                    }}>
                      <div style={{ color: s.color, fontSize: 26, fontWeight: 800 }}>{s.value}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <TimetableGrid
                    schedules={weeklyHomeroomSchedules} loading={isLoadingHomeroomSchedules}
                    showTeacher={true} showClass={false}
                    weekStart={weekStart}
                    emptyDescription="Không có thời khóa biểu lớp chủ nhiệm trong tuần đã chọn"
                  />
                </div>
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Bạn chưa được phân công lớp chủ nhiệm</p>
                    </div>
                  }
                />
              </div>
            )
          },
          {
            key: 'exam-schedule',
            label: (
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileDoneOutlined /> Lịch kiểm tra
                {myExams.length > 0 && <Tag color="orange" style={{ margin: 0 }}>{myExams.length}</Tag>}
              </span>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Lịch kiểm tra đã tạo</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                      Học sinh sẽ thấy lịch kiểm tra trực tiếp trong thời khóa biểu của tuần tương ứng.
                    </p>
                  </div>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setExamModalOpen(true)}
                    disabled={!examOptions.length}
                  >
                    Tạo lịch kiểm tra
                  </Button>
                </div>

                {!isLoadingExamOptions && !examOptions.length && (
                  <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 10, padding: 12, color: 'var(--text-primary)', marginBottom: 14 }}>
                    Bạn chưa có phân công giảng dạy nên chưa thể tạo lịch kiểm tra.
                  </div>
                )}

                <Table
                  rowKey="exam_schedule_id"
                  columns={examColumns}
                  dataSource={myExams}
                  loading={isLoadingExams}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                  scroll={{ x: 760 }}
                  locale={{ emptyText: 'Chưa có lịch kiểm tra nào' }}
                />
              </div>
            ),
          },
        ]}
      />

      <Modal
        title="Tạo lịch kiểm tra"
        open={examModalOpen}
        onCancel={() => {
          setExamModalOpen(false);
          setSelectedExamAssignmentId(null);
          examForm.resetFields();
        }}
        onOk={() => examForm.submit()}
        okText="Tạo lịch"
        cancelText="Hủy"
        confirmLoading={createExam.isPending}
        destroyOnHidden
      >
        <Form
          form={examForm}
          layout="vertical"
          onFinish={submitExam}
          initialValues={{ exam_type: 'MIDTERM' }}
          style={{ marginTop: 20 }}
        >
          <Form.Item
            name="assignment_id"
            label="Lớp và môn học"
            rules={[{ required: true, message: 'Vui lòng chọn lớp và môn học' }]}
          >
            <Select
              loading={isLoadingExamOptions}
              placeholder="Chọn lớp được phân công"
              showSearch
              optionFilterProp="label"
              onChange={(value) => {
                setSelectedExamAssignmentId(value);
                examForm.setFieldValue('exam_date', null);
              }}
              options={examOptions.map((option) => ({
                value: option.assignment_id,
                label: `Lớp ${option.class_instance.grade}${option.class_instance.class?.class_code} – ${option.subject.subject_name} – ${option.class_instance.year?.name}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="exam_type"
            label="Loại kiểm tra"
            rules={[{ required: true, message: 'Vui lòng chọn loại kiểm tra' }]}
          >
            <Select options={[
              { value: 'MIDTERM', label: 'Kiểm tra giữa kỳ' },
              { value: 'FINAL', label: 'Kiểm tra học kỳ' },
            ]} />
          </Form.Item>

          <Form.Item
            name="exam_date"
            label="Ngày kiểm tra"
            rules={[{ required: true, message: 'Vui lòng chọn ngày kiểm tra' }]}
          >
            <DatePicker
              format="DD/MM/YYYY"
              placeholder="Chọn ngày/tháng/năm"
              disabled={!selectedAssignment}
              disabledDate={disableExamDate}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="time_range"
            label="Giờ bắt đầu và kết thúc"
            rules={[{ required: true, message: 'Vui lòng chọn thời gian kiểm tra' }]}
          >
            <TimePicker.RangePicker
              format="HH:mm"
              minuteStep={5}
              placeholder={['Giờ bắt đầu', 'Giờ kết thúc']}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const formatExamDate = (value) => {
  const date = dayjs(value);
  const dayLabels = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return `${dayLabels[date.day()]}, ${date.format('DD/MM/YYYY')}`;
};

