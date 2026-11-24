import React, { useState, useEffect } from 'react';
import { Select, Button, Table, InputNumber, Typography, Spin, Alert, Tag, Tooltip, App, Modal, Timeline, Empty } from 'antd';
import { SaveOutlined, ReloadOutlined, CheckCircleOutlined, HistoryOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classesApi, scoresApi, assignmentsApi } from '../../api';

const { Text } = Typography;

const getScoreStyle = (v) => {
  if (v === null || v === undefined) return {};
  if (v >= 8) return { color: 'var(--success)', fontWeight: 700 };
  if (v < 5) return { color: 'var(--danger)', fontWeight: 700 };
  return { color: 'var(--text-primary)' };
};

const ScoreInputCell = ({ value, onChange, disabled }) => (
  <InputNumber
    min={0} max={10} step={0.5}
    value={value}
    onChange={onChange}
    disabled={disabled}
    className="score-input"
    style={{
      width: 64, textAlign: 'center',
      background: 'rgba(15,14,30,0.8)',
      border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: 6,
      color: value !== null && value !== undefined
        ? (value >= 8 ? 'var(--success)' : value < 5 ? 'var(--danger)' : 'var(--text-primary)')
        : 'var(--text-secondary)',
    }}
    controls={false}
    placeholder="—"
  />
);

/** Màu badge theo loại điểm */
const ScoreTypeBadge = ({ label }) => {
  const colorMap = {
    TX1: '#A78BFA', TX2: '#A78BFA', TX3: '#A78BFA', TX4: '#A78BFA', TX5: '#A78BFA',
    GK: 'var(--warning)',
    CK: '#F87171',
  };
  const c = colorMap[label] || 'var(--text-secondary)';
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 4,
      background: c + '22', color: c, fontWeight: 700, fontSize: 12,
      border: `1px solid ${c}`,
    }}>
      {label}
    </span>
  );
};

export default function ScoreEntryPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [classInstanceId, setClassInstanceId] = useState(null);
  const [subjectId, setSubjectId] = useState(null);
  const [semester, setSemester] = useState(1);
  const [localScores, setLocalScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedRows, setSavedRows] = useState(new Set());

  // History modal
  const [historyModal, setHistoryModal] = useState({ open: false, student: null });

  const { data: myClasses = [] } = useQuery({
    queryKey: ['my-classes'],
    queryFn: () => classesApi.getMyClasses().then(r => r.data.data),
  });

  const { data: mySubjects = [] } = useQuery({
    queryKey: ['teacher-subjects', classInstanceId],
    queryFn: () => classInstanceId
      ? assignmentsApi.getTeacherSubjects(classInstanceId).then(r => r.data.data)
      : Promise.resolve([]),
    enabled: !!classInstanceId,
  });

  const { data: classScores = [], isLoading: scoresLoading, refetch } = useQuery({
    queryKey: ['class-scores', classInstanceId, subjectId, semester],
    queryFn: () => scoresApi.getClassScores({ classInstanceId, subjectId, semester }).then(r => r.data.data),
    enabled: !!(classInstanceId && subjectId && semester),
  });

  const selectedClass = myClasses.find(c => c.class_instance_id === classInstanceId);
  const isLocked = selectedClass
    ? (Number(semester) === 1 ? selectedClass.year?.is_locked_sem1 : selectedClass.year?.is_locked_sem2)
    : false;

  // Score history query — fires only when modal is open
  const { data: historyData = [], isLoading: historyLoading } = useQuery({
    queryKey: ['score-history', historyModal.student?.student_id, subjectId, semester, selectedClass?.year_id],
    queryFn: () => scoresApi.getStudentHistory({
      studentId: historyModal.student.student_id,
      subjectId,
      semester,
      yearId: selectedClass?.year_id,
    }).then(r => r.data.data),
    enabled: !!(historyModal.open && historyModal.student && subjectId && semester),
  });

  // Sync remote scores → local state
  useEffect(() => {
    if (classScores && classScores.length > 0) {
      const init = {};
      classScores.forEach(row => {
        init[row.student_id] = {
          tx1: row.tx1, tx2: row.tx2, tx3: row.tx3, tx4: row.tx4, tx5: row.tx5,
          gk: row.gk, ck: row.ck,
        };
      });
      setLocalScores(init);
      setSavedRows(new Set());
    } else {
      setLocalScores({});
      setSavedRows(new Set());
    }
  }, [classScores]);

  const batchMut = useMutation({
    mutationFn: (scores) => scoresApi.batchUpsert(scores),
    onSuccess: () => {
      qc.invalidateQueries(['class-scores']);
      qc.invalidateQueries(['score-history']);
      message.success(' Lưu điểm thành công!');
    },
    onError: (e) => message.error(e.response?.data?.message || 'Lỗi lưu điểm'),
  });

  const updateLocal = (studentId, field, value) => {
    setLocalScores(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
    setSavedRows(prev => { const s = new Set(prev); s.delete(studentId); return s; });
  };

  const calcDTB = (row) => {
    const local = localScores[row.student_id] || {};
    const txVals = [local.tx1, local.tx2, local.tx3, local.tx4, local.tx5]
      .filter(v => v !== null && v !== undefined);
    const txAvg = txVals.length ? txVals.reduce((a, b) => a + b, 0) / txVals.length : null;
    const gk = local.gk ?? null;
    const ck = local.ck ?? null;
    if (txAvg !== null && gk !== null && ck !== null) {
      return Math.round(((txAvg + 2 * gk + 3 * ck) / 6) * 100) / 100;
    }
    return null;
  };

  const handleSaveAll = async () => {
    if (!subjectId || !semester || isLocked) return;
    setSaving(true);
    const scores = [];
    classScores.forEach(row => {
      const local = localScores[row.student_id] || {};
      for (let i = 1; i <= 5; i++) {
        const val = local[`tx${i}`];
        if (val !== null && val !== undefined) {
          scores.push({ student_id: row.student_id, subject_id: Number(subjectId), semester: Number(semester), score_type: 'TX', score_value: val, order_no: i, class_instance_id: classInstanceId });
        }
      }
      if (local.gk !== null && local.gk !== undefined)
        scores.push({ student_id: row.student_id, subject_id: Number(subjectId), semester: Number(semester), score_type: 'GK', score_value: local.gk, class_instance_id: classInstanceId });
      if (local.ck !== null && local.ck !== undefined)
        scores.push({ student_id: row.student_id, subject_id: Number(subjectId), semester: Number(semester), score_type: 'CK', score_value: local.ck, class_instance_id: classInstanceId });
    });
    if (scores.length > 0) {
      await batchMut.mutateAsync(scores);
      setSavedRows(new Set(classScores.map(r => r.student_id)));
    }
    setSaving(false);
  };

  const handleExportCSV = () => {
    if (!classScores || classScores.length === 0) return;
    const selectedSubject = mySubjects.find(s => s.subject_id === subjectId);
    const className = selectedClass ? `${selectedClass.grade}${selectedClass.class?.class_code}` : 'Lop';
    const subjectName = selectedSubject ? selectedSubject.subject?.subject_name : 'Mon';
    const headers = ['STT', 'Mã Học Sinh', 'Họ Và Tên', 'TX1', 'TX2', 'TX3', 'TX4', 'TX5', 'TB-TX', 'GK', 'CK', 'ĐTB'];
    const rows = classScores.map((row, idx) => {
      const local = localScores[row.student_id] || {};
      const txVals = [local.tx1, local.tx2, local.tx3, local.tx4, local.tx5].filter(v => v !== null && v !== undefined);
      const txAvg = txVals.length ? (txVals.reduce((a, b) => a + b, 0) / txVals.length).toFixed(2) : '';
      return [idx + 1, row.student_code || '', row.full_name || '', local.tx1 ?? '', local.tx2 ?? '', local.tx3 ?? '', local.tx4 ?? '', local.tx5 ?? '', txAvg, local.gk ?? '', local.ck ?? '', calcDTB(row) ?? ''];
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bang_Diem_${className}_Mon_${subjectName}_HK${semester}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const txColumns = [1, 2, 3, 4, 5].map(i => ({
    title: <span style={{ color: '#A78BFA', fontWeight: 700 }}>TX{i}</span>,
    dataIndex: `tx${i}`,
    width: 80,
    align: 'center',
    render: (_, row) => (
      <ScoreInputCell
        value={localScores[row.student_id]?.[`tx${i}`] ?? null}
        onChange={(v) => updateLocal(row.student_id, `tx${i}`, v)}
        disabled={isLocked}
      />
    ),
  }));

  const columns = [
    {
      title: '#', width: 50, align: 'center',
      render: (_, __, idx) => <Text style={{ color: 'var(--text-secondary)' }}>{idx + 1}</Text>,
    },
    {
      title: 'Họ và tên', dataIndex: 'full_name', width: 200,
      render: (name, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {savedRows.has(row.student_id) && <CheckCircleOutlined style={{ color: 'var(--success)' }} />}
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{name} {row.graduated_at && <Tag color="gold">Đã tốt nghiệp</Tag>}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{row.student_code}</div>
          </div>
        </div>
      ),
    },
    ...txColumns,
    {
      title: <span style={{ color: '#60A5FA', fontWeight: 700 }}>TB-TX</span>,
      width: 80, align: 'center',
      render: (_, row) => {
        const txVals = [1, 2, 3, 4, 5]
          .map(i => localScores[row.student_id]?.[`tx${i}`])
          .filter(v => v !== null && v !== undefined);
        const avg = txVals.length
          ? (txVals.reduce((a, b) => a + b, 0) / txVals.length).toFixed(2)
          : '—';
        return <Text style={{ color: '#60A5FA', fontWeight: 600 }}>{avg}</Text>;
      },
    },
    {
      title: <span style={{ color: 'var(--warning)', fontWeight: 700 }}>GK</span>,
      dataIndex: 'gk', width: 80, align: 'center',
      render: (_, row) => (
        <ScoreInputCell
          value={localScores[row.student_id]?.gk ?? null}
          onChange={(v) => updateLocal(row.student_id, 'gk', v)}
          disabled={isLocked}
        />
      ),
    },
    {
      title: <span style={{ color: '#F87171', fontWeight: 700 }}>CK</span>,
      dataIndex: 'ck', width: 80, align: 'center',
      render: (_, row) => (
        <ScoreInputCell
          value={localScores[row.student_id]?.ck ?? null}
          onChange={(v) => updateLocal(row.student_id, 'ck', v)}
          disabled={isLocked}
        />
      ),
    },
    {
      title: <span style={{ color: 'var(--success)', fontWeight: 700 }}>ĐTB</span>,
      width: 80, align: 'center',
      render: (_, row) => {
        const dtb = calcDTB(row);
        return dtb !== null
          ? <Text strong style={getScoreStyle(dtb)}>{dtb}</Text>
          : <Text style={{ color: 'var(--text-secondary)' }}>—</Text>;
      },
    },
    {
      title: <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Lịch sử</span>,
      width: 72, align: 'center',
      render: (_, row) => (
        <Tooltip title="Xem lịch sử chỉnh sửa điểm">
          <Button
            type="text"
            size="small"
            disabled={!subjectId || !semester}
            onClick={() => setHistoryModal({ open: true, student: row })}
            style={{ borderRadius: 6 }}
          >Xem</Button>
        </Tooltip>
      ),
    },
  ];

  // Format datetime
  const fmtDate = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Nhập điểm học sinh</h1>
        <p>Nhập điểm theo lớp, môn học và học kỳ.</p>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      }}>
        <Select
          placeholder="Chọn lớp" style={{ width: 220 }}
          value={classInstanceId}
          onChange={v => { setClassInstanceId(v); setSubjectId(null); setLocalScores({}); }}
          options={myClasses.map(c => ({ value: c.class_instance_id, label: `${c.grade}${c.class?.class_code} – ${c.year?.name}` }))}
          showSearch filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())}
        />
        <Select
          placeholder="Chọn môn" style={{ width: 180 }}
          value={subjectId}
          disabled={!classInstanceId}
          onChange={setSubjectId}
          options={mySubjects.map(a => ({ value: a.subject_id, label: a.subject?.subject_name }))}
        />
        <Select
          value={semester}
          onChange={setSemester}
          style={{ width: 140 }}
          options={[{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} style={{ borderRadius: 8 }}>Làm mới</Button>
        {classScores.length > 0 && (
          <Button
            onClick={handleExportCSV}
            style={{ borderRadius: 8, borderColor: 'var(--success)', color: 'var(--success)', fontWeight: 600 }}
          >
             Xuất CSV
          </Button>
        )}
        {classScores.length > 0 && (
          <Button
            type="primary" icon={<SaveOutlined />}
            loading={saving || batchMut.isPending}
            onClick={handleSaveAll}
            disabled={isLocked}
            style={{
              marginLeft: 'auto', borderRadius: 8, fontWeight: 700,
              background: isLocked ? '#d9d9d9' : 'linear-gradient(135deg, var(--primary), var(--accent))',
            }}
          >
             Lưu tất cả điểm
          </Button>
        )}
      </div>

      {isLocked && (
        <Alert
          message="Sổ điểm đã khóa"
          description="Bạn có thể xem điểm nhưng không thể chỉnh sửa trong năm học này."
          type="warning" showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      {!classInstanceId || !subjectId ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          <div style={{ marginTop: 12, fontSize: 16 }}>Chọn lớp và môn học để bắt đầu nhập điểm</div>
        </div>
      ) : scoresLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : classScores.length === 0 ? (
        <Alert message="Lớp này không có học sinh" type="info" showIcon />
      ) : (
        <>
          <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Text style={{ color: 'var(--text-muted)' }}>
              {classScores.length} học sinh · Học kỳ {semester}
            </Text>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              Công thức: ĐTB = (TB-TX + 2×GK + 3×CK) / 6
            </Text>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--success)', fontSize: 12 }}>Giỏi: từ 8,0</span>
              <span style={{ color: 'var(--info)', fontSize: 12 }}>Khá: từ 6,5</span>
              <span style={{ color: 'var(--warning)', fontSize: 12 }}>Trung bình: từ 5,0</span>
              <span style={{ color: 'var(--danger)', fontSize: 12 }}>Yếu: dưới 5,0</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <Table
              dataSource={classScores}
              columns={columns}
              rowKey="student_id"
              pagination={false}
              size="middle"
              rowClassName={(row) => savedRows.has(row.student_id) ? 'saved-row' : ''}
              style={{ minWidth: 980 }}
            />
          </div>

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button
              type="primary" size="large" icon={<SaveOutlined />}
              loading={saving || batchMut.isPending}
              onClick={handleSaveAll}
              disabled={isLocked}
              style={{ borderRadius: 10, fontWeight: 700, minWidth: 160 }}
            >
               Lưu tất cả điểm
            </Button>
          </div>
        </>
      )}

      {/* ── History Modal ── */}
      <Modal
        open={historyModal.open}
        onCancel={() => setHistoryModal({ open: false, student: null })}
        footer={null}
        width={580}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HistoryOutlined style={{ color: '#818CF8', fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Lịch sử chỉnh sửa điểm</span>
            {historyModal.student && (
              <Tag color="purple" style={{ fontWeight: 600, marginLeft: 4 }}>
                {historyModal.student.full_name}
              </Tag>
            )}
          </div>
        }
        styles={{ body: { maxHeight: 520, overflowY: 'auto', padding: '16px 24px' } }}
      >
        {!subjectId || !semester ? (
          <Alert message="Vui lòng chọn môn học và học kỳ trước" type="warning" showIcon />
        ) : historyLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : historyData.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ color: 'var(--text-muted)' }}>Chưa có lịch sử chỉnh sửa điểm nào</span>}
          />
        ) : (
          <>
            <div style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
              Tổng cộng <strong style={{ color: '#818CF8' }}>{historyData.length}</strong> lần thay đổi – sắp xếp mới nhất trước
            </div>
            <Timeline
              mode="left"
              items={historyData.map((h, idx) => ({
                key: h.history_id,
                color: idx === 0 ? '#818CF8' : 'var(--border)',
                label: (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {fmtDate(h.changed_at)}
                  </span>
                ),
                children: (
                  <div style={{
                    background: idx === 0 ? 'rgba(129,140,248,0.08)' : 'var(--bg-card-hover)',
                    borderRadius: 8, padding: '10px 14px', marginBottom: 4,
                    border: `1px solid ${idx === 0 ? 'rgba(129,140,248,0.3)' : 'var(--border)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <ScoreTypeBadge label={h.score_type_label} />
                      <span style={{ fontSize: 13 }}>
                        {h.old_value !== null && h.old_value !== undefined ? (
                          <>
                            <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{h.old_value}</span>
                            {' '}<ArrowRightOutlined style={{ color: 'var(--text-muted)', fontSize: 11 }} />{' '}
                            <span style={{ color: 'var(--success)', fontWeight: 700 }}>{h.new_value}</span>
                          </>
                        ) : (
                          <>
                            <span style={{ color: 'var(--text-muted)' }}>Tạo mới</span>
                            {' '}<ArrowRightOutlined style={{ color: 'var(--text-muted)', fontSize: 11 }} />{' '}
                            <span style={{ color: 'var(--success)', fontWeight: 700 }}>{h.new_value}</span>
                          </>
                        )}
                      </span>
                      {idx === 0 && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>Mới nhất</Tag>}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
                       <strong>{h.changed_by_name}</strong>
                    </div>
                  </div>
                ),
              }))}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
