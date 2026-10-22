# TopCV Clone — Nền tảng tuyển dụng và phân tích CV

Ứng dụng full-stack kết nối ứng viên với nhà tuyển dụng, hỗ trợ quản lý hồ sơ ứng tuyển, tạo CV và phân tích CV bằng Gemini AI.

Dự án học tập/portfolio lấy cảm hứng từ TopCV, không phải sản phẩm chính thức và không có liên kết với TopCV. Thương hiệu, nội dung minh họa và thông tin liên hệ trên giao diện chỉ phục vụ demo.

## Tính năng

| Ứng viên | Nhà tuyển dụng |
| --- | --- |
| Tìm việc theo từ khóa, địa điểm, ngành nghề, kinh nghiệm, mức lương và loại hình | Đăng, sửa, tạm dừng và xóa tin tuyển dụng |
| Sắp xếp việc làm, lưu tin và nộp hồ sơ | Xem hồ sơ, cập nhật trạng thái và ghi chú nội bộ |
| Theo dõi trạng thái ứng tuyển và thông báo | Nhận thông báo hồ sơ mới và xem thống kê tuyển dụng |
| Tạo CV theo mẫu, đặt CV mặc định, upload và tải CV | Truy cập CV đã được gửi cho tin tuyển dụng của mình |
| Đọc PDF/DOCX/TXT, xem lại văn bản và yêu cầu AI đánh giá CV theo JD | Quản lý thông tin công ty |

Hai vai trò dùng đăng nhập mật khẩu hoặc Google OAuth. Khôi phục mật khẩu sử dụng OTP email. Thống kê và thông báo lấy từ backend, không dùng dữ liệu giả thay thế dữ liệu thật.

### Phân tích CV bằng AI

- Nhận văn bản dán trực tiếp, nội dung CV Builder hoặc file PDF/DOCX/TXT.
- Đọc file ở backend trong tiến trình con, không lưu file trích xuất vào tài khoản. Giới hạn **10MB**, PDF **30 trang**, văn bản **40.000 ký tự**, thời gian xử lý **20 giây**.
- Người dùng xem và sửa văn bản trước khi chấm. Chỉ khi chấm, nội dung CV/JD mới được gửi đến Gemini.
- PDF scan cần OCR bên ngoài hoặc dán văn bản; DOC cũ cần chuyển sang DOCX/PDF để trích xuất. Luồng lưu CV thông thường vẫn hỗ trợ PDF/DOC/DOCX tối đa 20MB.
- Điểm AI có tính tham khảo, không phải chứng nhận ATS hay dự báo kết quả tuyển dụng đã được kiểm chứng.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React 18, Vite 5, React Router 6, Ant Design 5, Axios |
| Backend | Node.js, Express 5, MongoDB, Mongoose 9 |
| Xác thực | JWT, phiên lưu MongoDB, bcryptjs, Google OAuth |
| CV và AI | Gemini, pdf-parse, Mammoth, Puppeteer, jsPDF, html2canvas |
| Kiểm thử | Node.js test runner, mongodb-memory-server, Puppeteer/Chrome |
| CI | GitHub Actions: unit test, tích hợp MongoDB tạm, build frontend |

## Cài đặt và chạy

### Yêu cầu

- **Node.js 22.13 trở lên trong nhánh 22 LTS**, npm và MongoDB local hoặc MongoDB Atlas.
- Chrome cho xuất PDF ở backend và kiểm thử trình duyệt. Puppeteer tải browser khi cài backend; môi trường bỏ qua bước tải cần cấu hình browser riêng.

Các lệnh dưới đây sử dụng PowerShell. Không ghi đè `.env` nếu đã có cấu hình.

### 1. Backend

Từ thư mục gốc:

```powershell
cd BACKEND
npm ci
Copy-Item .env.example .env
```

Điền `MONGO_URI` và `JWT_SECRET` trong `BACKEND/.env`. Tạo secret riêng:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Sau đó chạy `npm run dev`. Backend mặc định tại **http://localhost:5000**, chỉ lắng nghe sau khi kết nối MongoDB thành công.

### 2. Frontend

Mở terminal thứ hai từ thư mục gốc:

```powershell
cd FRONTEND
npm ci
Copy-Item .env.example .env
npm run dev
```

Mở **http://localhost:3000**. Tự đăng ký tài khoản ứng viên và nhà tuyển dụng để thử các luồng tương ứng. Dự án chưa đóng gói tài khoản demo hoặc script seed.

### Biến môi trường

**Backend — `BACKEND/.env`**

| Biến | Cấu hình |
| --- | --- |
| `PORT` | Mặc định `5000` |
| `MONGO_URI` | URI MongoDB; ví dụ có sẵn trong `.env.example` |
| `JWT_SECRET` | Secret riêng, bắt buộc; không dùng giá trị mẫu |
| `CLIENT_URL` | Origin frontend; local là `http://localhost:3000` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Bật Google OAuth; client ID phải khớp frontend |
| `EMAIL_USER`, `EMAIL_PASS` | Gmail gửi OTP; dùng mật khẩu ứng dụng của tài khoản gửi |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Bật chấm CV; model mặc định ghi trong `.env.example` |

**Frontend — `FRONTEND/.env`**

| Biến | Cấu hình |
| --- | --- |
| `VITE_API_URL` | URL gốc backend, local là `http://localhost:5000`; không thêm `/api` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID công khai |

Chỉ cấu hình dịch vụ tùy chọn khi cần chức năng tương ứng. Google OAuth cần khai báo origin frontend trong Google Cloud Console. Biến `VITE_` được đưa vào bundle trình duyệt: **không đặt API key, client secret hoặc JWT secret ở frontend**.

Nếu `.env` frontend đang trỏ đến backend deploy, tạo `FRONTEND/.env.development.local` chứa `VITE_API_URL=http://localhost:5000` để chạy local. Khởi động lại Vite sau khi đổi cấu hình.

## Kiểm thử và build

Từ `BACKEND`:

```powershell
npm test                  # Unit: quyền truy cập, validation, OTP, xử lý CV
npm run test:integration   # API HTTP và MongoDB tạm riêng
```

Từ `FRONTEND`:

```powershell
npm run build             # Sinh FRONTEND/dist
npm run preview           # Xem bản build, không thay thế backend
```

Sau khi build frontend, từ `BACKEND`:

```powershell
npm run test:browser       # Chrome headless, API giả lập
```

Integration test tự tạo và dọn MongoDB tạm, không đọc `MONGO_URI` hoặc `.env` ứng dụng. Lần đầu cần mạng để tải binary MongoDB. Browser test dùng profile tạm; hỗ trợ Chrome/Edge trên Windows hoặc biến `PUPPETEER_EXECUTABLE_PATH` cho runner.

Các ca kiểm thử bao gồm phân quyền, thu hồi phiên, CV mặc định, hồ sơ, thông báo, tìm kiếm trả chậm, lưu nhiều việc đồng thời và bố cục 375px. CI hiện chưa chạy browser test. OAuth, email, Gemini và luồng browser/API/database kết hợp vẫn cần kiểm tra trên bản triển khai thật.

## Cấu trúc mã nguồn

```text
.
├── BACKEND/
│   ├── config/          Database và cấu hình xác thực
│   ├── controllers/     Xử lý request theo nghiệp vụ
│   ├── middleware/      Xác thực, phân quyền, upload, rate limit
│   ├── models/          Mongoose schemas
│   ├── routes/          Endpoint HTTP
│   ├── services/        Phiên, thông báo, số liệu, CV mặc định, đọc file
│   ├── tests/           Unit, integration và browser tests
│   ├── utils/           Validation, ngày báo cáo, template PDF
│   ├── uploads/         Dữ liệu runtime, không theo dõi bằng Git
│   └── .env.example
├── FRONTEND/
│   ├── public/          Tài nguyên tĩnh
│   ├── src/
│   │   ├── components/  Thành phần dùng lại và theo nghiệp vụ
│   │   ├── constants/   Trạng thái ứng tuyển
│   │   ├── hooks/       Auth context
│   │   ├── layouts/     Layout theo vai trò
│   │   ├── pages/       Các trang tải theo route
│   │   ├── services/    API client và dịch vụ
│   │   └── utils/       Định dạng, làm sạch HTML
│   └── .env.example
├── .github/workflows/ci.yml
└── ROADMAP.md
```

## API chính

API không có prefix `/api`. Endpoint riêng tư yêu cầu `Authorization: Bearer <token>`.

| Nhóm | Endpoint tiêu biểu | Quyền |
| --- | --- | --- |
| Xác thực | `POST /auth/register`, `/auth/login`, `/auth/google` | Công khai, rate limit |
| Khôi phục mật khẩu | `POST /auth/send-otp`, `/auth/reset-password` | Công khai, rate limit |
| Hồ sơ và phiên | `GET/PATCH /auth/profile`, `POST /auth/logout` | Đăng nhập |
| Tìm việc/công ty | `GET /jobs`, `/jobs/:id`, `/companies` | Công khai |
| Trang chủ | `GET /jobs/overview` | Công khai |
| Ứng tuyển/lưu tin | `POST /jobs/:id/apply`, `/jobs/:id/save` | Ứng viên |
| Trạng thái hồ sơ | `GET /jobs/:id/application` | Ứng viên, hồ sơ của mình |
| Tuyển dụng | `/employer/*` | Nhà tuyển dụng, kiểm tra sở hữu |
| CV | `/cvs`, `/cvs/:id`, `PATCH /cvs/:id/default` | Ứng viên, kiểm tra sở hữu |
| Đọc file | `POST /cvs/extract`, multipart field `file` | Ứng viên, 20 lượt/15 phút |
| AI | `POST /cvs/score`, JSON `cvText`, `jobTitle`, `jobDesc` | Ứng viên, 10 lượt/15 phút |
| Thông báo | `GET /notifications`, `PATCH /notifications/:eventId/read`, `/notifications/read-all` | Đăng nhập |
| File CV | `GET /uploads/cvs/:filename` | Chủ CV hoặc nhà tuyển dụng nhận đúng hồ sơ |

## Thiết kế dữ liệu và quyền truy cập

- JWT tham chiếu phiên còn hiệu lực trong MongoDB. Logout thu hồi phiên hiện tại; đổi/reset mật khẩu vô hiệu hóa phiên cũ qua `authVersion`. Token hiện lưu ở localStorage; chưa dùng cookie HttpOnly hoặc refresh token.
- `Application` là nguồn chính của số hồ sơ/lịch sử ứng tuyển; số tin công ty tính từ `Job`. Trường đếm cũ giữ để tương thích nhưng không quyết định số liệu hiển thị.
- `User.defaultCvId` xác định một CV mặc định, có xử lý lựa chọn/xóa đồng thời và dữ liệu cũ nhiều cờ mặc định.
- Ghi chú tuyển dụng không trả về cho ứng viên hoặc đưa vào thông báo. CV upload yêu cầu xác thực; ảnh tại `/uploads/img` là công khai.
- Hồ sơ và thông báo tải lại định kỳ khoảng 30 giây khi tab hiển thị hoặc quay lại tab. Đây là polling, chưa dùng WebSocket. Thông báo chưa phải nhật ký đầy đủ mọi lần đổi trạng thái.

## Triển khai và giới hạn

Backend chạy bằng `npm start`; frontend phát hành `FRONTEND/dist`. Hosting frontend cần fallback về `index.html` cho React Router. Điền URL hai phía và cấu hình OAuth theo domain trước khi build/deploy.

- Upload cần volume bền vững hoặc object storage, không phụ thuộc ổ đĩa tạm của hosting.
- Rate limiter dùng bộ nhớ một tiến trình. Nhiều instance cần shared store và cấu hình proxy phù hợp.
- Cần hoàn thiện cleanup file, quota upload, kiểm tra nội dung file ở toàn bộ luồng lưu CV và tính nguyên tử khi đóng/xóa tin cùng lúc ứng tuyển.
- Một số bundle frontend còn lớn. Chưa đóng gói demo online/tài khoản seed.
- Kế hoạch tiếp theo: [ROADMAP.md](ROADMAP.md).

Không commit `.env`, khóa thật, log hoặc dữ liệu upload. Ngừng theo dõi file không xóa bản trong lịch sử Git; cần rà soát lịch sử và thu hồi khóa từng lộ trước khi public repository.
