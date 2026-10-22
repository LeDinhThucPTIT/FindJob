// ===========================
// services/jobService.js
// Kết nối với Backend API thật qua Axios
// ===========================

import apiClient from "./api"; // Import instance axios đã cấu hình của bạn

const jobService = {
  /**
   * Lấy danh sách việc làm (Backend đã lo việc filter và phân trang)
   * @param {Object} params - { keyword, location, category, salary, experience, page, limit }
   */
  getJobs: async (params = {}, signal) => {
    // Axios sẽ tự động nối params thành chuỗi query: /jobs?keyword=react&page=1...
    return await apiClient.get("/jobs", { params, signal });
  },

  /**
   * Lấy chi tiết 1 việc làm theo ID
   */
  getJobById: async (id, signal) => {
    return await apiClient.get(`/jobs/${id}`, { signal });
  },
  getOverview: async () => apiClient.get("/jobs/overview"),
  getMyApplication: async (id, signal) => apiClient.get(`/jobs/${id}/application`, { signal }),

  /**
   * Lấy việc làm nổi bật (hot jobs)
   */
  getHotJobs: async (limit = 6) => {
    return await apiClient.get("/jobs/hot", { params: { limit } });
  },

  /**
   * Lấy việc làm gợi ý (recommend)
   */
  getRecommendedJobs: async (limit = 4) => {
    return await apiClient.get("/jobs/recommended", { params: { limit } });
  },

  /**
   * Ứng tuyển việc làm
   * @param {string} jobId - ID của công việc
   * @param {Object} values - Dữ liệu CV gửi đi
   */
  applyJob: async (jobId, values) => {
    const formData = new FormData();

    // 1. Đưa các text vào form
    formData.append("fullName", values.fullName);
    formData.append("email", values.email);
    formData.append("phone", values.phone);

    // BỔ SUNG TRƯỜNG cvType VÀO ĐÂY (Mặc định là 'pdf' nếu không truyền)
    formData.append("cvType", values.cvType || "pdf");

    if (values.coverLetter) formData.append("coverLetter", values.coverLetter);

    // 2. Đưa File vào form (Ant Design Upload trả về fileList array)
    const cvFileList = Array.isArray(values.cv)
      ? values.cv
      : values.cv?.fileList || [];

    if (cvFileList.length > 0) {
      const fileObj = cvFileList[0];
      // originFileObj là File object của browser
      const file = fileObj.originFileObj || fileObj;
      if (file) {
        formData.append("cv", file);
      }
    }

    return await apiClient.post(`/jobs/${jobId}/apply`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
  /**
   * Lưu việc làm yêu thích (Toggle: Lưu/Bỏ lưu)
   */
  saveJob: async (jobId, saved) => {
    return await apiClient.post(`/jobs/${jobId}/save`, { saved });
  },
};

export default jobService;
