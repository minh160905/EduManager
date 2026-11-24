import { useState } from 'react';
import { Alert, Button, Card, Collapse, Input, Space, Tag, Typography } from 'antd';
import { RobotOutlined, SendOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { chatbotApi } from '../../api';

const { Title, Text, Paragraph } = Typography;
const suggestions = [
  'Điều kiện để học sinh được lên lớp là gì?',
  'Quy trình xin nghỉ học như thế nào?',
  'Học sinh được đánh giá rèn luyện ra sao?',
];

export default function ChatbotPage() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const ask = async (value = question) => {
    const text = value.trim();
    if (text.length < 3 || loading) return;
    setQuestion('');
    setMessages(previous => [...previous, { type: 'user', text }]);
    setLoading(true);
    try {
      const response = await chatbotApi.ask(text);
      setMessages(previous => [...previous, { type: 'assistant', ...response.data.data }]);
    } catch (error) {
      setMessages(previous => [...previous, {
        type: 'error', text: error.response?.data?.message || 'Không thể kết nối chatbot. Vui lòng thử lại.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <Title level={3}><RobotOutlined /> Trợ lý tra cứu</Title>
      <Paragraph type="secondary">Hỏi về quy định và quy trình học tập THPT từ tài liệu đã nạp.</Paragraph>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }}
        message="Nguồn đang là bản nháp"
        description="Quy trình và biểu mẫu riêng của trường cần được phê duyệt. Thông tin pháp lý cần kiểm tra văn bản và ngày hiệu lực trước khi áp dụng. Chatbot chỉ đọc điểm và lịch theo quyền tài khoản đang đăng nhập. Không nhập thông tin cá nhân nhạy cảm vào câu hỏi."
      />
      <Card style={{ marginBottom: 16, minHeight: 280 }}>
        {messages.length === 0 && (
          <Space wrap>
            {suggestions.map(item => <Button key={item} onClick={() => ask(item)}>{item}</Button>)}
          </Space>
        )}
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {messages.map((message, index) => (
            <div key={index} style={{ textAlign: message.type === 'user' ? 'right' : 'left' }}>
              {message.type === 'user' ? (
                <Tag color="blue" style={{ whiteSpace: 'normal', padding: '8px 12px' }}>{message.text}</Tag>
              ) : message.type === 'error' ? (
                <Alert type="error" showIcon message={message.text} />
              ) : (
                <div>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{message.answer}</Paragraph>
                  {message.route && <Link to={message.route}>Mở mục trong ứng dụng</Link>}
                  {message.mode === 'knowledge_preview' && <Text type="secondary">Đang hiển thị các đoạn tài liệu liên quan; mô hình chưa tổng hợp câu trả lời.</Text>}
                  {!!message.sources?.length && (
                    <Collapse size="small" style={{ marginTop: 10 }} items={message.sources.map(source => ({
                      key: source.id,
                      label: `${source.id} · ${source.section}`,
                      children: <>
                        <Text type="secondary">{source.source} · đoạn {source.paragraph_start}–{source.paragraph_end} · bản nháp</Text>
                        <Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{source.content}</Paragraph>
                      </>,
                    }))} />
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && <Text type="secondary">Đang tìm tài liệu và soạn câu trả lời…</Text>}
        </Space>
      </Card>
      <Space.Compact style={{ width: '100%' }}>
        <Input value={question} maxLength={500} size="large" placeholder="Nhập câu hỏi của bạn…"
          onChange={event => setQuestion(event.target.value)} onPressEnter={() => ask()} />
        <Button type="primary" size="large" icon={<SendOutlined />} loading={loading} onClick={() => ask()}>Gửi</Button>
      </Space.Compact>
    </div>
  );
}
