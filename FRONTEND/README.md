# Frontend

Giao diện React 18, Vite và Ant Design cho ứng viên và nhà tuyển dụng.

Xem [README ở thư mục gốc](../README.md) để cấu hình backend, biến môi trường, tính năng và kiểm thử toàn dự án.

Chạy từ thư mục `FRONTEND`:

```powershell
npm ci
Copy-Item .env.example .env  # Chỉ khi chưa có .env
npm run dev                # http://localhost:3000
```

Đặt `VITE_API_URL` trỏ đến backend, không thêm `/api`. Khởi động lại Vite khi thay đổi `.env`. Không đặt khóa bí mật trong biến `VITE_`.

```powershell
npm run build              # Output: dist/
npm run preview            # Xem bản build, vẫn cần backend riêng
```

Kiểm thử trình duyệt đặt tại `BACKEND/tests/browser`; build frontend trước rồi chạy `npm run test:browser` từ thư mục `BACKEND`.
