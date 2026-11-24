import React, { useState } from 'react';
import {
  Button, Modal, Form, Input, Drawer, Table, Tag, Typography,
  Avatar, Spin, Empty, Tabs,
} from 'antd';
import {
  PlusOutlined, UserOutlined, MailOutlined,
  PhoneOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subjectsApi } from '../../api';
import { App } from 'antd';

const { Text } = Typography;

// Màu gradient cho từng card theo index
const CARD_GRADIENTS = [
  ['var(--primary)', 'var(--accent)'],
  ['#0EA5E9', 'var(--primary-light)'],
  ['var(--success)', 'var(--success)'],
  ['var(--warning)', 'var(--warning)'],
  ['var(--danger)', 'var(--danger)'],
  ['#8B5CF6', 'var(--accent)'],
  ['#14B8A6', '#0D9488'],
  ['#F97316', '#EA580C'],
];

export default function SubjectsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form] = Form.useForm();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSubject, setActiveSubject] = useState(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: subjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsApi.getAll().then(r => r.data.data),
  });

  const { data: subjectTeachers = [], isLoading: teachersLoading } = useQuery({
    queryKey: ['subject-teachers', activeSubject?.subject_id],
    queryFn: () => subjectsApi.getTeachersBySubject(activeSubject.subject_id).then(r => r.data.data),
    enabled: !!activeSubject,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (d) => subjectsApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['subjects']); setModalOpen(false); message.success('Thêm môn học thành công'); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => subjectsApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['subjects']); setModalOpen(false); message.success('Cập nhật thành công'); },
  });

  const openModal = (sub = null) => {
    setEdit(sub);
    sub ? form.setFieldsValue(sub) : form.resetFields();
    setModalOpen(true);
  };

  const openDrawer = (subject) => {
    setActiveSubject(subject);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setActiveSubject(null);
  };


  // ── Teacher (view) columns ──────────────────────────────────────────────────
  const teacherViewColumns = [
    {
      title: 'Giáo viên', render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))', fontWeight: 700, flexShrink: 0 }}
            icon={<UserOutlined />}
          />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.full_name}</div>
            {r.email && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MailOutlined style={{ fontSize: 10 }} />{r.email}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'SĐT', dataIndex: 'phone',
      render: v => v
        ? <span style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          <PhoneOutlined style={{ fontSize: 10 }} />{v}
        </span>
        : <Text style={{ color: 'var(--text-secondary)' }}>—</Text>,
    },
    {
      title: 'Lớp phụ trách', dataIndex: 'classes',
      render: (classes) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {classes?.map((c, i) => (
            <Tag key={i} color="purple" style={{ borderRadius: 6, fontSize: 12 }}>
              {c.grade}{c.class_code} – {c.year}
            </Tag>
          ))}
        </div>
      ),
    },
  ];

  const [c1Active] = activeSubject
    ? CARD_GRADIENTS[subjects.findIndex(s => s.subject_id === activeSubject.subject_id) % CARD_GRADIENTS.length]
    : ['var(--primary)', 'var(--accent)'];

  return (
    <div>
      <div className="page-header">
        <h1>Quản lý môn học</h1>
        <p>Quản lý môn học và giáo viên phụ trách.</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}
          style={{ borderRadius: 8 }}>
          Thêm môn học
        </Button>
      </div>

      {/* Subject cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {subjects.map((s, i) => {
          const [c1, c2] = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
          return (
            <div
              key={s.subject_id}
              onClick={() => openDrawer(s)}
              style={{
                background: `linear-gradient(135deg, color-mix(in srgb, ${c1} 13%, transparent), color-mix(in srgb, ${c2} 8%, transparent))`,
                border: `1px solid color-mix(in srgb, ${c1} 25%, transparent)`,
                borderRadius: 14,
                padding: '18px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.25s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = `0 10px 30px color-mix(in srgb, ${c1} 19%, transparent)`;
                e.currentTarget.style.borderColor = `color-mix(in srgb, ${c1} 50%, transparent)`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = `color-mix(in srgb, ${c1} 25%, transparent)`;
              }}
            >
              {/* Glow orb */}
              <div style={{
                position: 'absolute', top: -20, right: -20,
                width: 80, height: 80, borderRadius: '50%',
                background: c1, opacity: 0.12, filter: 'blur(20px)',
                pointerEvents: 'none',
              }} />

              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
                  {s.subject_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: c1, fontSize: 12, fontWeight: 500 }}>
                  <TeamOutlined style={{ fontSize: 11 }} />
                  <span>Xem giáo viên phụ trách</span>
                </div>
              </div>

              <Button
                size="small"
                onClick={(e) => { e.stopPropagation(); openModal(s); }}
                style={{
                  borderRadius: 8, background: `color-mix(in srgb, ${c1} 13%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${c1} 25%, transparent)`, color: c1,
                  flexShrink: 0,
                }}
              >Sửa</Button>
            </div>
          );
        })}

        {/* Add new card */}
        <button
          onClick={() => openModal()}
          style={{
            background: 'rgba(79,70,229,0.05)',
            border: '2px dashed rgba(79,70,229,0.3)',
            borderRadius: 14, padding: '18px 20px',
            cursor: 'pointer', color: 'var(--primary)', fontSize: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s', minHeight: 80,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(79,70,229,0.6)'; e.currentTarget.style.background = 'rgba(79,70,229,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(79,70,229,0.3)'; e.currentTarget.style.background = 'rgba(79,70,229,0.05)'; }}
        >
          +
        </button>
      </div>

      {/* ── Drawer: Chi tiết môn học ── */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        width={700}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 16 }}>
                {activeSubject?.subject_name}
              </div>
              <div style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 500 }}>
                Giáo viên phụ trách môn học
              </div>
            </div>
          </div>
        }
        styles={{
          header: { background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' },
          body: { background: 'var(--bg-page)', padding: 0 },
          mask: { backdropFilter: 'blur(4px)' },
        }}
      >
        <Tabs
          style={{ padding: '0 20px' }}
          tabBarStyle={{ paddingTop: 12, marginBottom: 0 }}
          items={[
            // ── Tab duy nhất: Danh sách GV ────────────────────────────────────
            {
              key: 'teachers',
              label: <span><UserOutlined /> Giáo viên phụ trách</span>,
              children: (
                <div style={{ padding: '16px 0' }}>
                  {teachersLoading ? (
                    <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                  ) : subjectTeachers.length === 0 ? (
                    <Empty
                      description={
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Chưa có giáo viên nào được phân công dạy môn <strong style={{ color: 'var(--primary)' }}>{activeSubject?.subject_name}</strong>
                        </span>
                      }
                      style={{ padding: 40 }}
                    />
                  ) : (
                    <>
                      {/* Summary */}
                      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                        <div style={{
                          background: 'rgba(79,70,229,0.15)', border: '1px solid rgba(79,70,229,0.3)',
                          borderRadius: 12, padding: '12px 20px', textAlign: 'center', flex: 1,
                        }}>
                          <div style={{ color: 'var(--primary)', fontSize: 28, fontWeight: 800 }}>{subjectTeachers.length}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Giáo viên</div>
                        </div>
                        <div style={{
                          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: 12, padding: '12px 20px', textAlign: 'center', flex: 1,
                        }}>
                          <div style={{ color: 'var(--success)', fontSize: 28, fontWeight: 800 }}>
                            {subjectTeachers.reduce((sum, t) => sum + (t.classes?.length || 0), 0)}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Lớp phụ trách</div>
                        </div>
                      </div>
                      <Table
                        dataSource={subjectTeachers}
                        columns={teacherViewColumns}
                        rowKey="user_id"
                        pagination={false}
                        size="middle"
                        style={{ borderRadius: 12, overflow: 'hidden' }}
                      />
                    </>
                  )}
                </div>
              ),
            }
          ]}
        />
      </Drawer>

      {/* ── Modal thêm/sửa môn học ── */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={<span style={{ color: 'var(--text-primary)' }}>{edit ? ' Sửa môn học' : ' Thêm môn học'}</span>}
        footer={null} destroyOnClose
      >
        <Form
          form={form} layout="vertical"
          onFinish={(v) => edit ? updateMut.mutate({ id: edit.subject_id, d: v }) : createMut.mutate(v)}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="subject_name" label="Tên môn học" rules={[{ required: true }]}>
            <Input placeholder="VD: Toán, Văn, Anh..." />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit"
              loading={createMut.isPending || updateMut.isPending}>
              {edit ? 'Cập nhật' : 'Thêm'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
