import React, { useState, useEffect } from 'react';
import { Tabs, Table, Button, Modal, Form, Input, Select, Space, Typography, Tag, Drawer, Avatar, Spin, Empty } from 'antd';
import { PlusOutlined, EditOutlined, CalendarOutlined, EyeOutlined, UserOutlined, ManOutlined, WomanOutlined, EnvironmentOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classesApi, usersApi, scoresApi, subjectsApi, conductsApi } from '../../api';
import { useAuthStore } from '../../store/auth.store';
import { App } from 'antd';
import dayjs from 'dayjs';

const { Text } = Typography;

const getScoreStyle = (v) => {
  if (v === null || v === undefined) return { color: 'var(--text-muted)' };
  if (v >= 8) return { color: 'var(--success)', fontWeight: 700 };
  if (v < 5) return { color: 'var(--danger)', fontWeight: 700 };
  return { color: 'var(--text-primary)', fontWeight: 500 };
};

const getConductTag = (rating) => {
  const ratings = {
    WEAK: { label: 'Yếu', color: 'error' },
    AVERAGE: { label: 'Trung bình', color: 'warning' },
    GOOD: { label: 'Khá', color: 'blue' },
    EXCELLENT: { label: 'Tốt', color: 'green' },
  };
  const display = ratings[rating];
  return <Tag color={display?.color || 'default'} style={{ fontWeight: 600, fontSize: 13 }}>{display?.label || 'Chưa đánh giá'}</Tag>;
};

export default function ClassesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const isPrincipal = currentUser?.role === 'PRINCIPAL';

  // ── State ────────────────────────────────────────────────────────────────
  const [instanceModal, setInstanceModal] = useState(false);
  const [editInstance, setEditInstance] = useState(null);
  const [instanceForm] = Form.useForm();
  const [classModal, setClassModal] = useState(false);
  const [classForm] = Form.useForm();
  const [yearModal, setYearModal] = useState(false);
  const [yearForm] = Form.useForm();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeInstance, setActiveInstance] = useState(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [scoresSemester, setScoresSemester] = useState(1);
  const [conductSemester, setConductSemester] = useState(1);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: () => classesApi.getAll().then(r => r.data.data) });
  const { data: years = [] } = useQuery({ queryKey: ['years'], queryFn: () => classesApi.getYears().then(r => r.data.data) });
  const { data: instances = [], isLoading } = useQuery({ queryKey: ['instances'], queryFn: () => classesApi.getInstances().then(r => r.data.data) });
  const { data: teachers = [] } = useQuery({
    queryKey: ['users', { role: ['TEACHER', 'HEAD_OF_DEPARTMENT', 'PRINCIPAL'] }],
    queryFn: () => usersApi.getAll({ role: ['TEACHER', 'HEAD_OF_DEPARTMENT', 'PRINCIPAL'] }).then(r => r.data.data),
  });

  // Query chi tiết lớp học (bao gồm học sinh và phụ huynh)
  const { data: classDetail = null, isLoading: studentsLoading } = useQuery({
    queryKey: ['class-detail', activeInstance?.class_instance_id],
    queryFn: () => classesApi.getHomeroomClassDetail(activeInstance.class_instance_id).then(r => r.data.data),
    enabled: !!activeInstance,
  });

  const studentsList = classDetail?.students || [];

  // Query môn học
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsApi.getAll().then(r => r.data.data),
  });

  // Query điểm
  const { data: classScores = [], isLoading: scoresLoading } = useQuery({
    queryKey: ['class-scores', activeInstance?.class_instance_id, selectedSubjectId, scoresSemester],
    queryFn: () => scoresApi.getClassScores({
      classInstanceId: activeInstance.class_instance_id,
      subjectId: selectedSubjectId,
      semester: scoresSemester
    }).then(r => r.data.data),
    enabled: !!activeInstance && !!selectedSubjectId,
  });

  // Query hạnh kiểm
  const { data: classConducts = [], isLoading: conductsLoading } = useQuery({
    queryKey: ['class-conducts', activeInstance?.class_instance_id, conductSemester, activeInstance?.year_id],
    queryFn: () => conductsApi.getByClass({
      class_instance_id: activeInstance.class_instance_id,
      semester: conductSemester,
      year_id: activeInstance.year_id
    }).then(r => r.data.data),
    enabled: !!activeInstance,
  });

  useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].subject_id);
    }
  }, [subjects, selectedSubjectId]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createClass = useMutation({ mutationFn: (d) => classesApi.create(d), onSuccess: () => { qc.invalidateQueries(['classes']); setClassModal(false); message.success('Tạo lớp thành công'); } });
  const createYear = useMutation({ mutationFn: (d) => classesApi.createYear(d), onSuccess: () => { qc.invalidateQueries(['years']); setYearModal(false); message.success('Tạo năm học thành công'); } });
  const createInstance = useMutation({ mutationFn: (d) => classesApi.createInstance(d), onSuccess: () => { qc.invalidateQueries(['instances']); setInstanceModal(false); message.success('Tạo lớp học thành công'); } });
  const updateInstance = useMutation({ mutationFn: ({ id, d }) => classesApi.updateInstance(id, d), onSuccess: () => { qc.invalidateQueries(['instances']); setInstanceModal(false); message.success('Cập nhật thành công'); } });
  const toggleYearLockMut = useMutation({
    mutationFn: ({ id, semester }) => classesApi.toggleYearLock(id, { semester }),
    onSuccess: () => {
      qc.invalidateQueries(['years']);
      message.success('Cập nhật trạng thái khóa sổ điểm thành công');
    },
    onError: (e) => message.error(e.response?.data?.message || 'Lỗi cập nhật trạng thái khóa'),
  });

  const openInstanceModal = (inst = null) => {
    setEditInstance(inst);
    if (inst) instanceForm.setFieldsValue({ homeroom_teacher_id: inst.homeroom_teacher_id, grade: inst.grade, class_id: inst.class_id, year_id: inst.year_id });
    else instanceForm.resetFields();
    setInstanceModal(true);
  };

  const submitInstance = (vals) => {
    if (editInstance) updateInstance.mutate({ id: editInstance.class_instance_id, d: vals });
    else createInstance.mutate(vals);
  };

  const openStudentsDrawer = (inst) => {
    setActiveInstance(inst);
    setDrawerOpen(true);
  };

  // ── Student table columns in Drawer ───────────────────────────────────────
  const studentColumns = [
    {
      title: 'Mã HS', dataIndex: 'student_code', width: 130,
      render: v => <Text style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>{v || '—'}</Text>,
    },
    {
      title: 'Học sinh',
      width: 240,
      render: (_, r) => (
        <Space>
          <Avatar
            size={36}
            style={{
              background: r.gender === 'Nữ'
                ? 'linear-gradient(135deg, #EC4899, #F472B6)'
                : 'linear-gradient(135deg, var(--primary), var(--accent))',
              fontWeight: 700, fontSize: 14, flexShrink: 0,
            }}
          >
            {r.user?.full_name?.[0] || '?'}
          </Avatar>
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>{r.user?.full_name || '—'} {r.graduated_at && <Tag color="gold">Đã tốt nghiệp</Tag>}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>@{r.user?.username}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Ngày sinh', dataIndex: 'date_of_birth', width: 125,
      render: v => <Text style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{v ? dayjs(v).format('DD/MM/YYYY') : '—'}</Text>,
    },
    {
      title: 'Giới tính', dataIndex: 'gender',
      width: 90,
      render: v => v ? (
        <Tag
          color={v === 'Nữ' ? 'pink' : 'blue'}
          icon={v === 'Nữ' ? <WomanOutlined /> : <ManOutlined />}
          style={{ borderRadius: 8 }}
        >
          {v}
        </Tag>
      ) : <Text style={{ color: 'var(--text-secondary)' }}>—</Text>,
    },
    {
      title: 'Quê quán', dataIndex: 'hometown',
      width: 120,
      render: v => v
        ? <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}><EnvironmentOutlined style={{ marginRight: 4 }} />{v}</Text>
        : <Text style={{ color: 'var(--text-secondary)' }}>—</Text>,
    },
    {
      title: 'Phụ huynh',
      width: 190,
      render: (_, r) => {
        const parentNames = r.parents?.map(p => p.parent?.user?.full_name).filter(Boolean).join(', ');
        return <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{parentNames || '—'}</Text>;
      }
    },
    {
      title: 'SĐT Phụ huynh',
      width: 135,
      render: (_, r) => {
        const parentPhones = r.parents?.map(p => p.parent?.user?.phone).filter(Boolean).join(', ');
        return <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{parentPhones || '—'}</Text>;
      }
    },
  ];

  const scoreColumns = [
    { title: '#', dataIndex: 'student_code', width: 90 },
    { title: 'Học sinh', dataIndex: 'full_name', render: (v) => <Text strong>{v}</Text> },
    { title: 'TX1', dataIndex: 'tx1', render: (v) => <span style={getScoreStyle(v)}>{v ?? '—'}</span> },
    { title: 'TX2', dataIndex: 'tx2', render: (v) => <span style={getScoreStyle(v)}>{v ?? '—'}</span> },
    { title: 'TX3', dataIndex: 'tx3', render: (v) => <span style={getScoreStyle(v)}>{v ?? '—'}</span> },
    { title: 'TX4', dataIndex: 'tx4', render: (v) => <span style={getScoreStyle(v)}>{v ?? '—'}</span> },
    { title: 'TX5', dataIndex: 'tx5', render: (v) => <span style={getScoreStyle(v)}>{v ?? '—'}</span> },
    { title: 'TB TX', dataIndex: 'tx_avg', render: (v) => <span style={{ ...getScoreStyle(v), background: 'var(--border-soft)', padding: '2px 6px', borderRadius: 4 }}>{v ?? '—'}</span> },
    { title: 'GK', dataIndex: 'gk', render: (v) => <span style={getScoreStyle(v)}>{v ?? '—'}</span> },
    { title: 'CK', dataIndex: 'ck', render: (v) => <span style={getScoreStyle(v)}>{v ?? '—'}</span> },
    { title: 'ĐTB', dataIndex: 'dtb', render: (v) => <span style={{ ...getScoreStyle(v), color: v >= 8 ? 'var(--success)' : v < 5 ? 'var(--danger)' : 'var(--primary)', fontSize: 15 }}>{v ?? '—'}</span> },
  ];

  const conductColumns = [
    { title: '#', dataIndex: 'student_code', width: 90 },
    { title: 'Học sinh', dataIndex: 'full_name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Hạnh kiểm', dataIndex: 'rating', render: (v) => getConductTag(v) },
    { title: 'Nhận xét / Ghi chú', dataIndex: 'note', render: (v) => <Text type="secondary" style={{ fontStyle: v ? 'normal' : 'italic' }}>{v || 'Chưa có ghi chú'}</Text> },
    { title: 'GV Đánh giá', dataIndex: 'teacher_name', render: (v) => <Tag icon={<UserOutlined />} color="purple">{v}</Tag> }
  ];

  const instanceColumns = [
    { title: 'Lớp', render: (_, r) => <Text strong style={{ color: 'var(--primary)', fontSize: 16 }}>{r.grade}{r.class?.class_code}</Text>, width: 80 },
    { title: 'Năm học', render: (_, r) => <Tag color="purple">{r.year?.name}</Tag> },
    { title: 'Khối', dataIndex: 'grade', render: v => <Tag>{v}</Tag> },
    { title: 'GVCN', render: (_, r) => <Text style={{ color: 'var(--text-primary)' }}>{r.homeroom_teacher?.full_name || '—'}</Text> },
    { title: 'Sĩ số', render: (_, r) => <Tag color="blue">{r._count?.enrollments || 0} học sinh</Tag> },
    {
      title: 'Thao tác', render: (_, r) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openStudentsDrawer(r)}
            style={{ borderRadius: 6, borderColor: 'var(--success)', color: 'var(--success)' }}
          >
            Xem chi tiết
          </Button>
          {!isPrincipal && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openInstanceModal(r)}
              style={{ borderRadius: 6, borderColor: 'var(--primary)', color: 'var(--primary)' }}>Sửa</Button>
          )}
        </Space>
      ),
    },
  ];

  const classLabel = activeInstance ? `${activeInstance.grade}${activeInstance.class?.class_code}` : '';

  return (
    <div>
      <div className="page-header">
        <h1>Quản lý lớp học</h1>
        <p>Quản lý lớp học, năm học và gán giáo viên chủ nhiệm</p>
      </div>

      <Tabs
        defaultActiveKey="instances"
        items={[
          {
            key: 'instances', label: 'Lớp học theo năm',
            children: (
              <div>
                {!isPrincipal && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openInstanceModal()}>Thêm lớp</Button>
                    <Button icon={<PlusOutlined />} onClick={() => setClassModal(true)}>Thêm mã lớp</Button>
                    <Button icon={<CalendarOutlined />} onClick={() => setYearModal(true)}>Thêm năm học</Button>
                  </div>
                )}
                <Table dataSource={instances} columns={instanceColumns} rowKey="class_instance_id" loading={isLoading}
                  pagination={{ pageSize: 20 }} scroll={{ x: 800 }} size="middle" />
              </div>
            ),
          },
          {
            key: 'classes', label: 'Mã lớp',
            children: (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {classes.map(c => (
                    <div key={c.class_id} style={{
                      background: 'var(--primary-soft)', border: '1px solid var(--primary-border)',
                      borderRadius: 12, padding: '16px 24px', minWidth: 100, textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{c.class_code}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Lớp {c.class_code}</div>
                    </div>
                  ))}
                  {!isPrincipal && (
                    <button onClick={() => setClassModal(true)} style={{
                      background: 'var(--bg-page)', border: '2px dashed var(--primary-border)',
                      borderRadius: 12, padding: '16px 24px', minWidth: 100, cursor: 'pointer',
                      color: 'var(--primary)', fontSize: 24,
                    }}>+</button>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'years', label: 'Năm học',
            children: (
              <div>
                {years.map(y => (
                  <div key={y.year_id} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    borderRadius: 10, padding: '14px 20px', marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', minWidth: 120 }}>{y.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, flex: 1 }}>
                      {new Date(y.start_date).toLocaleDateString('vi-VN')} → {new Date(y.end_date).toLocaleDateString('vi-VN')}
                    </div>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      {/* Học kỳ I */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Học kỳ I:</span>
                        <Tag color={y.is_locked_sem1 ? 'red' : 'green'} style={{ borderRadius: 6, padding: '2px 8px', fontSize: 12, margin: 0 }}>
                          {y.is_locked_sem1 ? ' Khóa' : ' Mở'}
                        </Tag>
                        {!isPrincipal && (
                          <Button
                            size="small"
                            danger={!y.is_locked_sem1}
                            type={y.is_locked_sem1 ? 'default' : 'primary'}
                            icon={y.is_locked_sem1 ? <UnlockOutlined /> : <LockOutlined />}
                            onClick={() => toggleYearLockMut.mutate({ id: y.year_id, semester: 1 })}
                            loading={toggleYearLockMut.isPending}
                            style={{ borderRadius: 6 }}
                          >
                            {y.is_locked_sem1 ? 'Mở' : 'Khóa'}
                          </Button>
                        )}
                      </div>

                      {/* Học kỳ II */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Học kỳ II:</span>
                        <Tag color={y.is_locked_sem2 ? 'red' : 'green'} style={{ borderRadius: 6, padding: '2px 8px', fontSize: 12, margin: 0 }}>
                          {y.is_locked_sem2 ? ' Khóa' : ' Mở'}
                        </Tag>
                        {!isPrincipal && (
                          <Button
                            size="small"
                            danger={!y.is_locked_sem2}
                            type={y.is_locked_sem2 ? 'default' : 'primary'}
                            icon={y.is_locked_sem2 ? <UnlockOutlined /> : <LockOutlined />}
                            onClick={() => toggleYearLockMut.mutate({ id: y.year_id, semester: 2 })}
                            loading={toggleYearLockMut.isPending}
                            style={{ borderRadius: 6 }}
                          >
                            {y.is_locked_sem2 ? 'Mở khóa' : 'Khóa'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {!isPrincipal && <Button icon={<PlusOutlined />} onClick={() => setYearModal(true)} style={{ marginTop: 8 }}>Thêm năm học</Button>}
              </div>
            ),
          },
        ]}
        style={{ background: 'var(--bg-card)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      />

      {/* ── Drawer: Danh sách học sinh ── */}
      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setActiveInstance(null); }}
        width={780}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17 }}>
                Lớp {classLabel} – {activeInstance?.year?.name}
              </div>
              <div style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 500 }}>
                GVCN: {activeInstance?.homeroom_teacher?.full_name || 'Chưa phân công'}
              </div>
            </div>
          </div>
        }
        styles={{
          header: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' },
          body: { background: 'var(--bg-page)', padding: '20px' },
        }}
      >
        {studentsLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : (() => {
          const mergedConducts = studentsList.map(s => {
            const record = (classConducts || []).find(c => c.student_id === s.student_id);
            return {
              student_id: s.student_id,
              student_code: s.student_code,
              full_name: s.user?.full_name,
              rating: record?.rating || null,
              note: record?.note || '',
              teacher_name: record?.teacher?.full_name || '—'
            };
          });

          return (
            <Tabs
              defaultActiveKey="students"
              items={[
                {
                  key: 'students',
                  label: 'Học sinh & Phụ huynh',
                  children: studentsList.length === 0 ? (
                    <Empty
                      description={<span style={{ color: 'var(--text-secondary)' }}>Lớp <strong style={{ color: 'var(--primary)' }}>{classLabel}</strong> chưa có học sinh nào</span>}
                      style={{ padding: 40 }}
                    />
                  ) : (
                    <>
                      {/* Summary stats */}
                      <div className="summary-strip" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                        {[
                          { label: 'Tổng học sinh', value: studentsList.length, color: 'var(--primary)', bg: 'rgba(79,70,229,0.15)', border: 'rgba(79,70,229,0.3)' },
                          { label: 'Học sinh Nam', value: studentsList.filter(s => s.gender === 'Nam').length, color: '#60A5FA', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
                          { label: 'Học sinh Nữ', value: studentsList.filter(s => s.gender === 'Nữ').length, color: '#F472B6', bg: 'rgba(244,114,182,0.1)', border: 'rgba(244,114,182,0.3)' },
                        ].map((stat, i) => (
                          <div key={i} style={{
                            flex: 1, background: stat.bg, border: `1px solid ${stat.border}`,
                            borderRadius: 12, padding: '14px 16px', textAlign: 'center',
                          }}>
                            <div style={{ color: stat.color, fontSize: 28, fontWeight: 800 }}>{stat.value}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Student table */}
                      <Table
                        dataSource={studentsList}
                        columns={studentColumns}
                        rowKey="student_id"
                        pagination={{ pageSize: 10, showTotal: t => `${t} học sinh` }}
                        scroll={{ x: 1030 }}
                        size="middle"
                        style={{ borderRadius: 12, overflow: 'hidden' }}
                      />
                    </>
                  )
                },
                {
                  key: 'scores',
                  label: 'Bảng điểm lớp',
                  children: (
                    <div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Môn học:</span>
                        <Select
                          placeholder="Chọn môn học"
                          options={subjects.map(s => ({ value: s.subject_id, label: s.subject_name }))}
                          value={selectedSubjectId}
                          onChange={setSelectedSubjectId}
                          style={{ width: 200 }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 12 }}>Học kỳ:</span>
                        <Select
                          options={[{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }]}
                          value={scoresSemester}
                          onChange={setScoresSemester}
                          style={{ width: 150 }}
                        />
                      </div>
                      {scoresLoading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                      ) : classScores.length === 0 ? (
                        <Empty description="Không có dữ liệu điểm" />
                      ) : (
                        <Table
                          dataSource={classScores}
                          columns={scoreColumns}
                          rowKey="student_id"
                          pagination={false}
                          scroll={{ x: 780 }}
                          size="small"
                          style={{ borderRadius: 12, overflow: 'hidden' }}
                        />
                      )}
                    </div>
                  )
                },
                {
                  key: 'conducts',
                  label: 'Hạnh kiểm lớp',
                  children: (
                    <div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Học kỳ:</span>
                        <Select
                          options={[{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }]}
                          value={conductSemester}
                          onChange={setConductSemester}
                          style={{ width: 150 }}
                        />
                      </div>
                      {conductsLoading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                      ) : mergedConducts.length === 0 ? (
                        <Empty description="Không có dữ liệu hạnh kiểm" />
                      ) : (
                        <Table
                          dataSource={mergedConducts}
                          columns={conductColumns}
                          rowKey="student_id"
                          pagination={false}
                          scroll={{ x: 660 }}
                          size="small"
                          style={{ borderRadius: 12, overflow: 'hidden' }}
                        />
                      )}
                    </div>
                  )
                }
              ]}
            />
          );
        })()}
      </Drawer>

      {/* Instance Modal */}
      <Modal open={instanceModal} onCancel={() => setInstanceModal(false)}
        title={<span style={{ color: 'var(--text-primary)' }}>{editInstance ? 'Cập nhật lớp học' : 'Thêm lớp học mới'}</span>}
        footer={null} destroyOnClose>
        <Form form={instanceForm} layout="vertical" onFinish={submitInstance} style={{ marginTop: 16 }}>
          <Form.Item name="grade" label="Khối" rules={[{ required: true }]}>
            <Select options={[{ value: 10, label: 'Khối 10' }, { value: 11, label: 'Khối 11' }, { value: 12, label: 'Khối 12' }]} />
          </Form.Item>
          <Form.Item name="class_id" label="Mã lớp" rules={[{ required: true }]}>
            <Select options={classes.map(c => ({ value: c.class_id, label: `Lớp ${c.class_code}` }))} />
          </Form.Item>
          <Form.Item name="year_id" label="Năm học" rules={[{ required: true }]}>
            <Select options={years.map(y => ({ value: y.year_id, label: y.name }))} />
          </Form.Item>
          <Form.Item name="homeroom_teacher_id" label="GVCN">
            <Select allowClear placeholder="Chọn giáo viên chủ nhiệm"
              options={teachers.map(t => ({ value: t.user_id, label: t.full_name }))} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setInstanceModal(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={createInstance.isPending || updateInstance.isPending}>
              {editInstance ? 'Cập nhật' : 'Thêm'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Class Modal */}
      <Modal open={classModal} onCancel={() => setClassModal(false)} title={<span style={{ color: 'var(--text-primary)' }}>Thêm mã lớp</span>} footer={null} destroyOnClose>
        <Form form={classForm} layout="vertical" onFinish={(v) => createClass.mutate(v)} style={{ marginTop: 16 }}>
          <Form.Item name="class_code" label="Mã lớp (ví dụ: A, B, C)" rules={[{ required: true }]}>
            <Input placeholder="A" maxLength={5} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setClassModal(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={createClass.isPending}>Thêm</Button>
          </div>
        </Form>
      </Modal>

      {/* Year Modal */}
      <Modal open={yearModal} onCancel={() => setYearModal(false)} title={<span style={{ color: 'var(--text-primary)' }}>Thêm năm học</span>} footer={null} destroyOnClose>
        <Form form={yearForm} layout="vertical" onFinish={(v) => createYear.mutate(v)} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên năm học (VD: 2024-2025)" rules={[{ required: true }]}>
            <Input placeholder="2024-2025" />
          </Form.Item>
          <Form.Item name="start_date" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="end_date" label="Ngày kết thúc" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setYearModal(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={createYear.isPending}>Thêm</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
