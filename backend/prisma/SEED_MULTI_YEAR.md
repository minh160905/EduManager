# Dữ liệu mẫu nhiều năm học

Script `seed_multi_year_demo.js` chỉ **bổ sung** dữ liệu còn thiếu. Không dùng `seed.js` để cập nhật dữ liệu mẫu: file đó xóa dữ liệu trước khi tạo lại.

## Nội dung

| Năm học | Lớp | Học sinh | Phụ huynh liên kết | Điểm | Hạnh kiểm | Tiết/tuần toàn trường |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2024–2025 (giữ nguyên) | 9 | 90 | 9 | 7.200 | 180 | 270 |
| 2025–2026 (đã kết thúc) | 9 | 90 | 15 | 7.200 | 180 | 270 |
| 2026–2027 (hiện tại) | 12 | 120 | 30 | 2.880 | 120 | 360 |

Năm 2026–2027 có thêm các lớp 10D, 11D, 12D. Mỗi lớp mới có 10 học sinh, 8 môn, 8 phân công, 1 GVCN và 30 tiết/tuần. Giáo viên và GVCN đều lấy từ 32 giáo viên đã có, không tạo giáo viên mới. Lịch mới được kiểm tra trùng giáo viên, lớp và phòng trong từng năm.

Điểm năm 2025–2026 có đủ hai học kỳ, mỗi môn/kỳ gồm 3 điểm thường xuyên, giữa kỳ và cuối kỳ. Năm 2026–2027 là dữ liệu mẫu giữa học kỳ I: 2 điểm thường xuyên và giữa kỳ, chưa có điểm cuối kỳ hoặc học kỳ II. Mốc ngày của năm học và các điểm/hạnh kiểm đều là **dữ liệu giả lập**, không phải lịch hoặc kết quả chính thức.

Bảng `student_enrollments` ghi mỗi học sinh thuộc lớp nào trong từng năm. Học sinh 10A–10C năm 2024–2025 lên 11A–11C năm 2025–2026 và 12A–12C năm 2026–2027. Học sinh 10A–10C năm 2025–2026 là khóa mới, rồi lên 11A–11C năm 2026–2027. Học sinh lớp 12 năm 2024–2025 và nhóm lên lớp 12 năm 2025–2026 có `graduated_at`; giao diện giáo viên, admin và hiệu trưởng hiện nhãn **Đã tốt nghiệp**. Điểm, hạnh kiểm và danh sách lớp cũ vẫn tra được theo năm.

## Chạy lại và kiểm tra

Từ thư mục `backend`:

```powershell
npm.cmd run db:create-enrollment-table
npm.cmd run db:generate
npm.cmd run db:seed-multi-year
node prisma/promote_demo_cohorts.js --dry-run
npm.cmd run db:promote-demo
npm.cmd run db:verify-multi-year
```

Chạy các lệnh theo thứ tự trên **chỉ với database thử nghiệm mới**. Sau khi chuyển lớp, `seed_multi_year_demo.js` sẽ từ chối chạy lại để không tạo nhóm học sinh trùng. `promote_demo_cohorts.js` kiểm tra trước, lưu bản sao các hồ sơ mẫu cần thay vào `backend/backups/` (thư mục này bị Git bỏ qua), và chạy giao dịch; chạy lại sau khi hoàn thành sẽ không thay đổi dữ liệu. Bảng `scores` có unique index `scores_unique_result` để ngăn điểm trùng.

Tài khoản mẫu mới:

| Vai trò | Tên đăng nhập | Mật khẩu mẫu |
| --- | --- | --- |
| Học sinh 10A năm 2026–2027 | `demo_hs_2627_10a_01` | `DemoStudent@2026` |
| Phụ huynh của học sinh trên | `demo_ph_2627_10a_01` | `DemoParent@2026` |

Chỉ dùng các tài khoản này trong môi trường thử nghiệm. Các tài khoản năm 2024–2025 vẫn còn nguyên.

**Giới hạn dữ liệu gốc:** Lịch 2024–2025 có 150 vị trí trùng giáo viên hoặc phòng từ script cũ. Lịch lịch sử đó được giữ nguyên theo yêu cầu bảo toàn dữ liệu; lịch hai năm mới không có xung đột.
