import { Badge, Popover, List, Button, Empty, Typography, Tag } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;

export default function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.getUnreadCount().then(r => r.data.data),
    refetchInterval: 30000, // poll every 30s
  });

  const { data: notifs } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationsApi.getAll().then(r => r.data.data),
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries(['notifications']);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries(['notifications']),
  });

  const unreadCount = unreadData?.count || 0;
  const recentNotifs = (notifs || []).slice(0, 8);

  const content = (
    <div style={{ width: 'min(360px, calc(100vw - 48px))' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 0 12px', borderBottom: '1px solid var(--border)',
      }}>
        <Text strong style={{ color: 'var(--text-primary)', fontSize: 15 }}>Thông báo</Text>
        {unreadCount > 0 && (
          <Button size="small" type="link"
            onClick={() => markAllRead.mutate()}
            style={{ color: 'var(--primary)', fontSize: 12 }}>
            Đọc tất cả
          </Button>
        )}
      </div>

      {recentNotifs.length === 0 ? (
        <Empty description={<span style={{ color: 'var(--text-muted)' }}>Không có thông báo</span>} style={{ padding: '20px 0' }} />
      ) : (
        <List
          dataSource={recentNotifs}
          renderItem={(item) => (
            <List.Item
              style={{
                padding: '10px 0',
                borderBottom: '1px solid var(--border-soft)',
                cursor: 'pointer',
                background: !item.is_read ? 'var(--primary-soft)' : 'transparent',
                borderRadius: 8, paddingInline: 8, marginBottom: 2,
                transition: 'background 0.2s',
              }}
              onClick={() => { if (!item.is_read) markRead.mutate(item.notification_id); }}
            >
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{item.notification?.title}</Text>
                  {!item.is_read && <Tag color="geekblue" style={{ fontSize: 10 }}>Mới</Tag>}
                </div>
                <Text style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  {item.notification?.content?.slice(0, 80)}...
                </Text>
                <Text style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  {item.notification?.creator?.full_name} · {dayjs(item.notification?.created_at).fromNow()}
                </Text>
              </div>
            </List.Item>
          )}
        />
      )}

      <div style={{ paddingTop: 12, textAlign: 'center' }}>
        <Button type="link" size="small" onClick={() => navigate('/notifications')}
          style={{ color: 'var(--primary)', fontWeight: 600 }}>
          Xem tất cả thông báo
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content} trigger="click" placement="bottomRight"
      overlayStyle={{ zIndex: 1001 }}
      overlayInnerStyle={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '12px 16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
      }}
    >
      <Badge count={unreadCount} overflowCount={99} size="small">
        <button className="header-text-button" type="button">Thông báo</button>
      </Badge>
    </Popover>
  );
}
