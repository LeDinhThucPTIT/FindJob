# Lộ trình hoàn thiện portfolio

## Đợt 1: bảo mật và nền tảng — đã triển khai

- [x] Chỉ trả các trường công khai của công ty.
- [x] Allowlist cập nhật công ty, tin đăng, CV; không nhận trường sở hữu/tài khoản từ body.
- [x] Làm sạch HTML mô tả việc làm và CV bằng DOMPurify.
- [x] Bảo vệ file CV, nối lại thao tác xem/tải có token ở frontend.
- [x] Bỏ JWT secret mặc định, hash mật khẩu tài khoản Google và bỏ API key hardcode.
- [x] OTP hash bằng HMAC, kiểm tra hết hạn trực tiếp, giới hạn số lần thử, tiêu thụ một lần.
- [x] Rate limit auth và chấm CV.
- [x] Chặn ứng tuyển job không tồn tại/đóng/hết hạn; cleanup file multipart khi thất bại.
- [x] Validate kết quả AI, giới hạn input, timeout frontend dài hơn, nhãn Gemini đúng.
- [x] Lazy load page, bổ sung test backend, CI và hướng dẫn cấu hình.

## Đợt 2: dữ liệu và nghiệp vụ

- [x] Dùng Application làm nguồn trạng thái/số hồ sơ; tính lượt ứng tuyển và số tin công ty từ dữ liệu gốc, không cập nhật các bộ đếm dư thừa. Kiểm thử gửi đơn đồng thời trên MongoDB tạm.
- [x] CV mặc định lấy từ một tham chiếu duy nhất trên tài khoản; chọn mặc định bằng cập nhật nguyên tử, tự chọn CV thay thế khi xóa và tương thích cờ mặc định cũ. Kiểm thử tạo/chọn/xóa đồng thời trên MongoDB.
- [ ] Hoàn thiện xác thực kiểu dữ liệu/định dạng, chuẩn hóa email và xử lý tài khoản trùng giữa hai collection.
- [x] JWT gắn với phiên lưu MongoDB, kiểm tra hạn và tài khoản ở mỗi request; logout thu hồi phiên hiện tại, đổi/reset mật khẩu tăng phiên bản xác thực bằng cùng thao tác cập nhật mật khẩu. Đồng bộ đăng xuất giữa các tab.
- [ ] Kiểm tra nội dung thực của file thay vì chỉ MIME/extension; dọn file mồ côi, quota upload.
- [x] Ghi chú nội bộ không trả về cho ứng viên, không phát qua localStorage; sửa ghi chú không làm đổi trạng thái hồ sơ. Optimistic concurrency chặn ghi đè giữa các request cùng đọc một phiên bản hồ sơ.
- [x] Thay số liệu giả ở homepage/dashboard bằng truy vấn thật; biểu đồ đủ 12 ngày theo UTC+7, gọi đúng chỉ số “đã offer” thay vì “đã tuyển”.
- [x] Bỏ cache trạng thái ứng tuyển trong localStorage; cập nhật từ server khi quay lại tab và mỗi 30 giây khi trang đang hiển thị. Lưu/bỏ lưu có trạng thái đích để retry an toàn.
- [x] Kiểm thử MongoDB tạm và Chrome headless với API giả lập cho các luồng dữ liệu/trạng thái và lỗi dashboard.
- [x] Chuông thông báo dùng dữ liệu thật cho hai vai trò, số chưa đọc, đánh dấu đã đọc/tất cả, phân trang và liên kết đúng việc làm/hồ sơ. Trạng thái đọc lưu MongoDB, không chứa ghi chú nội bộ.
- [ ] Seed tài khoản/demo data; kiểm thử xuyên suốt cả browser và API với MongoDB riêng (browser test hiện dùng API giả lập).
- [ ] Hoàn thiện tính nguyên tử vòng đời xóa/đóng job so với request ứng tuyển đang chạy; cleanup tài nguyên liên quan khi xóa.

## Đợt 3: AI

- [x] Trích xuất PDF/DOCX/TXT và cho xem lại, sửa text trước khi gửi AI. Endpoint riêng chỉ dành cho ứng viên, không lưu file; giới hạn 10MB, PDF 30 trang, 40.000 ký tự, timeout 20 giây và tối đa hai tiến trình con. Cách ly lỗi thư viện native PDF khỏi backend trên Windows. Kiểm tra cấu trúc DOCX và dung lượng giải nén. DOC cũ cần đổi sang DOCX/PDF; PDF scan cần OCR hoặc dán text.
- [ ] Rubric có trọng số, bằng chứng nhận xét từ CV/JD, bộ dữ liệu đánh giá tính ổn định.
- [ ] Lưu lịch sử, so sánh các phiên bản CV; đo độ trễ và chi phí.
- [ ] Timeout/cancellation phía server và quản lý quota của provider.
- [ ] Tránh hiển thị mức lương/cơ hội phỏng vấn như kết quả dự báo đã được kiểm chứng.

## Đợt 4: trải nghiệm và đóng gói

- [x] Rà soát đồng bộ tìm việc: hủy request cũ, lọc/sắp xếp trên API, URL giữ bộ lọc/phân trang, báo lỗi và thử lại. Bỏ kết quả công ty/thống kê lỗi thời, cập nhật chức năng lưu nhiều việc đồng thời và dọn timer chấm điểm khi rời trang.
- [x] Kiểm tra Chrome ở 375px cho trang chủ, tìm việc, CV, chấm điểm, hồ sơ và dashboard tuyển dụng. Sửa footer tràn ngang, bộ lọc bị ẩn, thẻ thống kê quá chật, ảnh công ty lỗi và các liên kết footer tới trang chưa có. Kiểm thử browser dùng API giả lập; không thay thế kiểm thử trên bản deploy thật.

- [ ] Tách CVPage và EmployerDashboardPage thành component/hook theo nghiệp vụ.
- [ ] Tối ưu các chunk lớn còn lại, thư viện xuất PDF chỉ tải khi sử dụng.
- [ ] Kiểm thử responsive, accessibility, trạng thái tải/rỗng/lỗi và luồng hai vai trò trên browser.
- [ ] Demo online, lưu trữ bền vững, log/healthcheck, ảnh/video và sơ đồ kiến trúc.

## Thao tác của chủ dự án

- [ ] Thu hồi/đổi Gemini key từng có trong BACKEND/test-raw.js, kiểm tra lịch sử Git trước khi public.
- [ ] Điền JWT secret riêng và thông tin dịch vụ trong .env.
- [ ] Sau khi deploy, chạy smoke test với tài khoản demo, không dùng thông tin cá nhân thật.
