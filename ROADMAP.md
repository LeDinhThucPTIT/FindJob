# Roadmap

Các mục dưới đây là kế hoạch, chưa phải tính năng đã hoàn thành.

## Hoàn thiện bản demo

- Đóng gói seed dữ liệu giả có thể chạy lặp lại, kèm tài khoản ứng viên và nhà tuyển dụng chỉ dùng cho demo.
- Triển khai frontend/backend và lưu file trên volume bền vững hoặc object storage.
- Bổ sung ảnh giao diện và đường dẫn demo sau khi kiểm tra bản triển khai.
- Kiểm tra Google OAuth, email OTP và Gemini với cấu hình dịch vụ thật.

## Độ tin cậy

- Cleanup file khi thay thế/xóa CV, quota upload và kiểm tra nội dung file ở toàn bộ luồng lưu CV.
- Xử lý nguyên tử trường hợp ứng tuyển đồng thời với đóng/xóa tin.
- Chạy browser test trong CI và bổ sung kiểm thử browser/API/database kết hợp.
- Chuyển rate limiter sang shared store khi triển khai nhiều instance.

## Trải nghiệm và hiệu năng

- Giảm kích thước bundle của CV Builder và trang quản lý tuyển dụng.
- Đánh giá cookie HttpOnly, refresh token và cơ chế chống CSRF tương ứng.
- Đánh giá WebSocket nếu polling không còn đáp ứng nhu cầu thông báo.
