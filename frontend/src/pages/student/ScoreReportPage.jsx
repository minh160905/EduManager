import React, { useState } from 'react';
import { Table, Select, Button, Typography, Tag, Spin, Alert, Card, Statistic, Row, Col } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '../../api';

const { Text, Title } = Typography;

const ScoreCell = ({ value }) => {
  if (value === null || value === undefined) return <Text style={{ color: 'var(--text-secondary)' }}>—</Text>;
  let color = 'var(--text-primary)';
  let bg = 'transparent';
  if (value >= 8) { color = 'var(--success)'; bg = 'rgba(16,185,129,0.08)'; }
  else if (value < 5) { color = 'var(--danger)'; bg = 'rgba(239,68,68,0.08)'; }
  return (
    <span style={{
      color, background: bg, fontWeight: value >= 8 || value < 5 ? 700 : 500,
      padding: '2px 8px', borderRadius: 6, fontSize: 13,
    }}>{value.toFixed(1)}</span>
  );
};

const DTBCell = ({ value }) => {
  if (value === null || value === undefined) return <Text style={{ color: 'var(--text-secondary)' }}>—</Text>;
  let color, bg, label;
  if (value >= 8) { color = 'var(--success)'; bg = 'rgba(16,185,129,0.15)'; label = 'Giỏi'; }
  else if (value >= 6.5) { color = '#60A5FA'; bg = 'rgba(96,165,250,0.15)'; label = 'Khá'; }
  else if (value >= 5) { color = 'var(--warning)'; bg = 'rgba(245,158,11,0.15)'; label = ''; }
  else { color = 'var(--danger)'; bg = 'rgba(239,68,68,0.15)'; label = 'Yếu'; }
  return (
    <span style={{ color, background: bg, fontWeight: 800, padding: '3px 10px', borderRadius: 8, fontSize: 14, border: `1px solid color-mix(in srgb, ${color} 19%, transparent)` }}>
      {value.toFixed(2)} {label && <span style={{ fontSize: 11, marginLeft: 4 }}>({label})</span>}
    </span>
  );
};

export default function ScoreReportPage() {
  const [semester, setSemester] = useState(1);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['student-report', semester],
    queryFn: () => studentApi.getReport({ semester }).then(r => r.data.data),
  });

  const handleExportCSV = () => {
    if (!report || !report.subjects || report.subjects.length === 0) return;
    const headers = ['Môn học', 'TX1', 'TX2', 'TX3', 'TX4', 'TX5', 'TB-TX', 'GK', 'CK', 'ĐTB Môn'];
    const rows = report.subjects.map(s => [
      s.subject_name || '',
      s.tx1 ?? '',
      s.tx2 ?? '',
      s.tx3 ?? '',
      s.tx4 ?? '',
      s.tx5 ?? '',
      s.tx_avg ?? '',
      s.gk ?? '',
      s.ck ?? '',
      s.dtb ?? ''
    ]);
    rows.push([
      'ĐTB TỔNG KẾT HỌC KỲ',
      '', '', '', '', '', '', '', '',
      report.overall_avg ?? ''
    ]);
    rows.push([
      'XẾP LOẠI HỌC LỰC',
      '', '', '', '', '', '', '', '',
      report.academic_classification ?? ''
    ]);
    rows.push([
      'XẾP LOẠI HẠNH KIỂM',
      '', '', '', '', '', '', '', '',
      report.conduct_classification ?? ''
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Bang_Diem_${report.student.full_name}_HK${semester}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
    {
      title: 'Môn học', dataIndex: 'subject_name', width: 150,
      render: v => <Text strong style={{ color: 'var(--text-primary)' }}>{v}</Text>,
    },
    ...([1,2,3,4,5].map(i => ({
      title: <span style={{ color: '#A78BFA', fontWeight: 700 }}>TX{i}</span>,
      dataIndex: `tx${i}`, width: 70, align: 'center',
      render: v => <ScoreCell value={v} />,
    }))),
    {
      title: <span style={{ color: '#60A5FA', fontWeight: 700 }}>TB-TX</span>,
      dataIndex: 'tx_avg', width: 80, align: 'center',
      render: v => <ScoreCell value={v} />,
    },
    {
      title: <span style={{ color: 'var(--warning)', fontWeight: 700 }}>GK</span>,
      dataIndex: 'gk', width: 70, align: 'center',
      render: v => <ScoreCell value={v} />,
    },
    {
      title: <span style={{ color: '#F87171', fontWeight: 700 }}>CK</span>,
      dataIndex: 'ck', width: 70, align: 'center',
      render: v => <ScoreCell value={v} />,
    },
    {
      title: <span style={{ color: 'var(--success)', fontWeight: 800 }}>ĐTB Môn</span>,
      dataIndex: 'dtb', width: 120, align: 'center',
      render: v => <DTBCell value={v} />,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Bảng điểm học sinh</h1>
        <p>Xem kết quả học tập theo từng môn học</p>
      </div>

      {/* Student info */}
      {report?.student && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20,
        }}>
          {[
            { label: 'Họ tên', value: report.student.full_name, color: 'var(--primary)' },
            { label: 'Mã học sinh', value: report.student.student_code, color: '#60A5FA' },
            { label: 'Lớp', value: report.student.class, color: '#A78BFA' },
            { label: 'Năm học', value: report.student.year, color: '#34D399' },
            { label: 'Học lực học kỳ', value: report.academic_classification, color: 'var(--warning)' },
            { label: 'Hạnh kiểm học kỳ', value: report.conduct_classification, color: '#EC4899' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 4 }}>{item.label}</div>
              <div style={{ color: item.color, fontWeight: 700, fontSize: 15 }}>{item.value || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Semester select */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select value={semester} onChange={setSemester} style={{ width: 160 }}
          options={[{ value: 1, label: 'Học kỳ I' }, { value: 2, label: 'Học kỳ II' }]} />

        {report?.subjects?.length > 0 && (
          <Button
            onClick={handleExportCSV}
            style={{ borderRadius: 8, borderColor: 'var(--success)', color: 'var(--success)', fontWeight: 600 }}
          >
             Tải bảng điểm (CSV)
          </Button>
        )}

        {report?.overall_avg !== null && report?.overall_avg !== undefined && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(79,70,229,0.15)', border: '1px solid rgba(79,70,229,0.3)',
            borderRadius: 10, padding: '8px 16px', marginLeft: 'auto'
          }}>
            <Text style={{ color: 'var(--text-muted)' }}>ĐTB tổng kết:</Text>
            <DTBCell value={report.overall_avg} />
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12, fontSize: 12 }}>
        <span style={{ color: 'var(--success)' }}>Giỏi: từ 8,0</span>
        <span style={{ color: 'var(--info)' }}>Khá: từ 6,5</span>
        <span style={{ color: 'var(--warning)' }}>Trung bình: từ 5,0</span>
        <span style={{ color: 'var(--danger)' }}>Yếu: dưới 5,0</span>
        <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>ĐTB = (TB-TX + 2×GK + 3×CK) / 6</span>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : error ? (
        <Alert message="Không thể tải bảng điểm" type="error" showIcon />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table
            dataSource={report?.subjects || []}
            columns={columns}
            rowKey="subject_id"
            pagination={false}
            size="middle"
            summary={() => report?.overall_avg != null && (
              <Table.Summary.Row style={{ background: 'rgba(79,70,229,0.08)' }}>
                <Table.Summary.Cell colSpan={8}><Text strong style={{ color: 'var(--primary)' }}>ĐTB Tổng kết học kỳ {semester}</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="center"><DTBCell value={report.overall_avg} /></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      )}
    </div>
  );
}
