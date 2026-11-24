# Chatbot tra cứu THPT

Chatbot sử dụng tìm kiếm các đoạn tài liệu (RAG) rồi gửi tối đa bốn đoạn liên quan đến OpenAI Responses API. Đây không phải là fine-tuning mô hình. Khóa API chỉ nằm ở máy chủ, không gửi tới trình duyệt.

## Tài liệu đã nạp

`data/knowledge.json` được tạo từ `Training Material.docx`, 8 chương kiến thức. Tài liệu tự ghi rõ một số quy trình và biểu mẫu là đề xuất; bộ chỉ mục giữ trạng thái `draft_needs_school_and_legal_review`. Chương 9–11 là hướng dẫn xây chatbot nên không dùng làm câu trả lời. Tài liệu không chứa dữ liệu cá nhân của học sinh.

Khi cập nhật tài liệu, tạo lại chỉ mục bằng:

```powershell
python backend/scripts/build_knowledge.py "D:\Documents\Training Material.docx" backend/data/knowledge.json
```

Chạy lệnh từ thư mục gốc dự án. Xem lại thay đổi trong `knowledge.json`, đặc biệt là quy định có ngày hiệu lực và quy trình nội bộ, trước khi dùng trong môi trường thật.

## Bật OpenAI

Thêm vào `backend/.env`:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Khởi động lại backend. Khi chưa có khóa, giao diện vẫn tìm và hiển thị đoạn tài liệu liên quan để kiểm tra, nhưng chưa tổng hợp câu trả lời.

Trên máy Windows hiện tại, kết nối HTTPS cần chứng chỉ tin cậy của Windows. Các lệnh `npm run dev` và `npm start` đã khởi chạy Node với `--use-system-ca`. Cần Node hỗ trợ tùy chọn này (máy hiện dùng Node 24). Không tắt kiểm tra TLS.

Nếu OpenAI trả `credit_balance_exhausted`, tài khoản API không còn tín dụng. Chatbot sẽ hiển thị các đoạn tài liệu liên quan; quản trị viên cần bổ sung tín dụng trong phần API billing trước khi câu trả lời tổng hợp hoạt động.

Chatbot đọc trực tiếp ngày bắt đầu/kết thúc năm học từ database. Học sinh và phụ huynh có thể hỏi điểm thành phần, thời khóa biểu và liên hệ giáo viên trong phạm vi lớp đã liên kết. Giáo viên có thể hỏi lịch dạy của mình. Học sinh có thể hỏi lịch kiểm tra hôm nay hoặc ngày mai. Câu trả lời về lịch chỉ lấy các tiết nằm trong khoảng ngày của năm học tương ứng; điểm lưu trữ luôn nêu rõ năm học. Các truy vấn cá nhân chưa hỗ trợ được chuyển đến màn hình có phân quyền.

## Giới hạn hiện tại

- Bộ tài liệu tổng hợp chưa thay thế văn bản pháp lý gốc hoặc nội quy đã phê duyệt của trường. Cần bổ sung nguồn chính thức và duyệt từng mục trước khi coi câu trả lời là chính sách hiện hành.
- Các mốc lịch chi tiết như nghỉ lễ, họp phụ huynh chưa có bảng riêng trong schema hiện tại. Chatbot chỉ trả lời ngày bắt đầu/kết thúc năm học, thời khóa biểu và lịch kiểm tra đã được ghi vào hệ thống.
- Mỗi tài khoản tối đa 10 câu hỏi mỗi phút trên một tiến trình backend. Nếu triển khai nhiều tiến trình, chuyển giới hạn sang kho dùng chung.
