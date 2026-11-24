import { useState } from 'react';
import { Form, Input, Button, Alert } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';

const demoAccounts = [
  { label: 'Quản trị viên', username: 'admin', password: 'Admin@123' },
  { label: 'Hiệu trưởng', username: 'gv_hieutruong', password: 'Teacher@123' },
  { label: 'Tổ trưởng', username: 'gv_chunhiem', password: 'Teacher@123' },
  { label: 'Giáo viên', username: 'gv_bomon', password: 'Teacher@123' },
  { label: 'Học sinh', username: 'hocsinh1', password: 'Student@123' },
  { label: 'Phụ huynh', username: 'phuhuynh1', password: 'Parent@123' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const mode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const [form] = Form.useForm();
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: (data) => authApi.login(data),
    onSuccess: (response) => {
      const { token, user } = response.data.data;
      login(token, user);
      navigate('/');
    },
    onError: (err) => setError(err.response?.data?.message || 'Đăng nhập thất bại'),
  });

  return (
    <main className="login-page">
      <button className="header-text-button login-theme-button" type="button" onClick={toggleTheme}>
        {mode === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}
      </button>
      <div className="login-container">
        <div className="login-heading">
          <span className="brand-mark" aria-hidden="true">E</span>
          <div>
            <h1>EduManager</h1>
            <p>Hệ thống quản lý trường học</p>
          </div>
        </div>
        <section className="login-panel" aria-label="Đăng nhập">
          <h2>Đăng nhập</h2>
          {error && (
            <Alert message={error} type="error" closable onClose={() => setError('')}
              style={{ marginBottom: 18 }} />
          )}
          <Form form={form} layout="vertical" onFinish={loginMutation.mutate} size="large">
            <Form.Item name="username" label="Tên đăng nhập"
              rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}>
              <Input autoComplete="username" placeholder="Tên đăng nhập" />
            </Form.Item>
            <Form.Item name="password" label="Mật khẩu"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
              <Input.Password autoComplete="current-password" placeholder="Mật khẩu" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loginMutation.isPending}>
              Đăng nhập
            </Button>
          </Form>
        </section>
        <section className="login-panel demo-panel" aria-label="Tài khoản dùng thử">
          <h2>Tài khoản dùng thử</h2>
          <div className="demo-account-grid">
            {demoAccounts.map((account) => (
              <button
                className="demo-account"
                type="button"
                key={account.username}
                onClick={() => form.setFieldsValue({ username: account.username, password: account.password })}
              >
                <strong>{account.label}</strong>
                <small>{account.username}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
