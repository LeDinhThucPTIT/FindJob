# Giới thiệu dự án trong CV và phỏng vấn

## Mô tả ngắn

**TopCV Clone | Full-stack Recruitment Platform**  
React, Vite, Ant Design, Node.js, Express, MongoDB, JWT, Gemini AI.

- Xây dựng nền tảng tuyển dụng với hai vai trò ứng viên và nhà tuyển dụng; hỗ trợ tìm/lưu việc, ứng tuyển và quản lý trạng thái hồ sơ.
- Phát triển REST API với xác thực JWT, thu hồi phiên và kiểm tra quyền sở hữu hồ sơ, tin tuyển dụng và file CV.
- Tích hợp CV Builder, xuất PDF và phân tích CV theo mô tả công việc bằng Gemini; hỗ trợ trích xuất PDF/DOCX/TXT.
- Viết unit test và integration test với MongoDB tạm; cấu hình GitHub Actions kiểm thử backend và build frontend.

Chỉ sử dụng những ý phản ánh đúng phần bạn trực tiếp thực hiện. Bổ sung thời gian, vai trò, liên kết repository và demo thực tế trước khi đưa vào CV. Không gắn số người dùng, hiệu năng hoặc độ chính xác AI khi chưa đo lường.

## Kịch bản demo khoảng 5 phút

Chuẩn bị MongoDB và cấu hình theo [README](../README.md). Dùng dữ liệu giả; tự đăng ký hai tài khoản với hai vai trò. Dự án chưa có seed tự động.

1. **Nhà tuyển dụng:** cập nhật công ty, tạo tin tuyển dụng có hạn nộp trong tương lai và kiểm tra tin xuất hiện ở danh sách công khai.
2. **Ứng viên:** tìm/lọc tin, lưu tin, tạo hoặc upload CV bằng dữ liệu giả rồi ứng tuyển.
3. **Nhà tuyển dụng:** mở hồ sơ ứng tuyển, xem CV, cập nhật trạng thái và thêm ghi chú nội bộ.
4. **Ứng viên:** xem trạng thái mới và thông báo; xác nhận ghi chú nội bộ không xuất hiện.
5. **AI (cần Gemini API key):** tải CV mẫu PDF/DOCX/TXT, kiểm tra văn bản trích xuất, nhập JD rồi yêu cầu đánh giá.

Google OAuth và khôi phục mật khẩu cần cấu hình dịch vụ riêng. Tính năng AI gửi nội dung CV/JD đến Gemini khi người dùng yêu cầu chấm.

## Những điểm có thể giải thích khi phỏng vấn

| Chủ đề | Điểm triển khai |
| --- | --- |
| Quyền truy cập | Middleware xác thực, kiểm tra vai trò và quyền sở hữu ở backend; tải CV cũng yêu cầu xác thực |
| Phiên đăng nhập | JWT gắn với phiên MongoDB; logout thu hồi phiên, đổi/reset mật khẩu vô hiệu hóa phiên cũ |
| Dữ liệu tuyển dụng | Thống kê hồ sơ lấy từ Application, không dựa vào bộ đếm dư thừa |
| Xử lý file | Trích xuất ở tiến trình con với giới hạn thời gian, kích thước và độ dài văn bản |
| AI | Kiểm tra input và cấu trúc output; điểm đánh giá chỉ mang tính tham khảo |
| Kiểm thử | Unit, integration với MongoDB tạm và browser test với API giả lập |

Các giới hạn và hướng phát triển nằm trong [ROADMAP](../ROADMAP.md).
