import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { authApi, classesApi } from '../../api';
import NotificationBell from '../common/NotificationBell';

const { Sider, Header, Content } = Layout;

const TEACHER_MENUS = [
  { key: '/teacher/scores', label: 'Nhập điểm' },
  { key: '/teacher/comments', label: 'Nhận xét học sinh' },
  { key: '/teacher/notifications', label: 'Gửi thông báo' },
  { key: '/teacher/schedule', label: 'Thời khóa biểu' },
  { key: '/teacher/my-class', label: 'Lớp chủ nhiệm', homeroomOnly: true },
  { key: '/teacher/achievements', label: 'Duyệt thành tích', homeroomOnly: true },
];

const buildTeacherMenu = (isHomeroom) => [
  ...(isHomeroom ? TEACHER_MENUS.filter((item) => item.homeroomOnly) : []),
  ...TEACHER_MENUS.filter((item) => !item.homeroomOnly),
];

const MENUS = {
  ADMIN: [
    { key: '/admin/users', label: 'Người dùng' },
    { key: '/admin/classes', label: 'Lớp học' },
    { key: '/admin/subjects', label: 'Môn học' },
    { key: '/admin/schedule', label: 'Thời khóa biểu' },
  ],
  PRINCIPAL: [
    { key: '/admin/classes', label: 'Lớp học' },
    { key: '/principal/departments', label: 'Tổ chuyên môn' },
    { key: '/admin/assignments', label: 'Phân công giảng dạy' },
  ],
  STUDENT: [
    { key: '/student/report', label: 'Bảng điểm' },
    { key: '/student/achievements', label: 'Thành tích' },
    { key: '/student/schedule', label: 'Thời khóa biểu' },
    { key: '/student/comments', label: 'Nhận xét' },
  ],
  PARENT: [
    { key: '/parent/report', label: 'Bảng điểm của con' },
    { key: '/parent/achievements', label: 'Thành tích của con' },
    { key: '/parent/schedule', label: 'Thời khóa biểu' },
    { key: '/parent/comments', label: 'Nhận xét của con' },
  ],
};

const ROLE_LABELS = {
  ADMIN: 'Quản trị viên',
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
  PARENT: 'Phụ huynh',
  PRINCIPAL: 'Hiệu trưởng',
  HEAD_OF_DEPARTMENT: 'Tổ trưởng chuyên môn',
};

export default function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const mode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const role = user?.role;

  const { data: homeroomClass, isSuccess: homeroomLoaded } = useQuery({
    queryKey: ['my-homeroom-class'],
    queryFn: () => classesApi.getMyHomeroomClass().then((response) => response.data.data),
    enabled: role === 'TEACHER' || role === 'HEAD_OF_DEPARTMENT' || role === 'PRINCIPAL',
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  let menuItems;
  const teacherMenu = buildTeacherMenu(!homeroomLoaded || !!homeroomClass);
  if (role === 'TEACHER') menuItems = teacherMenu;
  else if (role === 'HEAD_OF_DEPARTMENT') {
    menuItems = [...teacherMenu, { key: '/admin/assignments', label: 'Phân công giảng dạy' }];
  } else if (role === 'PRINCIPAL') menuItems = [...MENUS.PRINCIPAL, ...teacherMenu];
  else menuItems = MENUS[role] || [];

  menuItems = [
    ...menuItems,
    { key: '/chatbot', label: 'Trợ lý tra cứu' },
    ...(role !== 'ADMIN' ? [{ key: '/notifications', label: 'Thông báo' }] : []),
  ];

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* Clear the local session even if the server is unavailable. */ }
    qc.clear();
    logout();
    navigate('/login');
  };

  const userMenu = [
    { key: 'logout', label: 'Đăng xuất', danger: true, onClick: handleLogout },
  ];

  return (
    <Layout className="app-shell">
      {mobileMenuOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Đóng menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <Sider width={240} trigger={null} className={`app-sidebar${mobileMenuOpen ? ' is-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <div>
            <strong>EduManager</strong>
            <small>Quản lý trường học</small>
          </div>
        </div>
        <div className="sidebar-role">{ROLE_LABELS[role] || 'Tài khoản'}</div>
        <nav className="sidebar-navigation" aria-label="Điều hướng chính">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => { setMobileMenuOpen(false); navigate(key); }}
          />
        </nav>
      </Sider>

      <Layout className="app-main">
        <Header className="app-header">
          <div className="header-start">
            <button
              className="header-text-button mobile-menu-button"
              type="button"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? 'Đóng menu' : 'Menu'}
            </button>
            <span className="header-page-title">
              {menuItems.find((item) => item.key === location.pathname)?.label || 'EduManager'}
            </span>
          </div>
          <div className="header-actions">
            <button className="header-text-button" type="button" onClick={toggleTheme}>
              {mode === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}
            </button>
            {role !== 'ADMIN' && <NotificationBell />}
            <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={['click']}>
              <button className="header-account" type="button" aria-label="Tài khoản và đăng xuất">
                <span className="account-initial" aria-hidden="true">
                  {(user?.fullName || user?.username || '?')[0].toUpperCase()}
                </span>
                <span className="account-copy">
                  <strong>{user?.fullName || user?.username}</strong>
                  <small>{ROLE_LABELS[role] || 'Tài khoản'}</small>
                </span>
              </button>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-content">
          <div className="fade-in"><Outlet /></div>
        </Content>
      </Layout>
    </Layout>
  );
}
