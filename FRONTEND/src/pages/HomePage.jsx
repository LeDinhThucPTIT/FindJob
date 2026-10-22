// ===========================
// Trang chủ - Landing page
// ===========================

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Select, Button, Row, Col, Card, Statistic, Spin, Alert, Empty } from "antd";
import {
  SearchOutlined,
  EnvironmentOutlined,
  RightOutlined,
  FireFilled,
  ThunderboltFilled,
  StarFilled,
  TeamOutlined,
  SolutionOutlined,
  RocketOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import JobCard from "../components/job/JobCard";
import jobService from "../services/jobService";
import "./HomePage.css";

const { Option } = Select;

const LOCATIONS = ["Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Cần Thơ", "Bình Dương"];

const HomePage = () => {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [hotJobs, setHotJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [overview, setOverview] = useState(null);
  const [dataError, setDataError] = useState(false);
  const statValue = (key) => overview?.stats?.[key]?.toLocaleString() ?? "—";

  useEffect(() => {
    let active = true;
    Promise.allSettled([jobService.getHotJobs(6), jobService.getOverview()]).then(([jobs, data]) => {
      if (!active) return;
      if (jobs.status === "fulfilled") setHotJobs(jobs.value);
      if (data.status === "fulfilled") setOverview(data.value);
      setDataError(jobs.status === "rejected" || data.status === "rejected");
      setLoadingJobs(false);
    });
    return () => { active = false; };
  }, []);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (location) params.set("location", location);
    navigate(`/jobs?${params.toString()}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="home-page">
      {dataError && <Alert type="warning" showIcon message="Chưa tải được một phần dữ liệu. Vui lòng tải lại trang để thử lại." />}
      {/* ===== HERO BANNER ===== */}
      <section className="hero">
        <div className="hero__bg">
          <div className="hero__blob hero__blob--1"></div>
          <div className="hero__blob hero__blob--2"></div>
          <div className="hero__grid"></div>
        </div>
        <div className="container">
          <div className="hero__content">
            <div className="hero__badge">
              <FireFilled style={{ color: "#ff6b35" }} />
              <span>
                {statValue("newJobsToday")} việc làm mới hôm
                nay
              </span>
            </div>
            <h1 className="hero__title">
              Tìm việc làm{" "}
              <span className="hero__title-highlight">phù hợp</span>
              <br /> với bạn ngay hôm nay
            </h1>
            <p className="hero__subtitle">
              Kết nối với nhà tuyển dụng. Xây dựng sự nghiệp
              của bạn cùng TopCV.
            </p>

            {/* Search bar */}
            <div className="hero__search">
              <div className="hero__search-inner">
                <div className="hero__search-field hero__search-field--keyword">
                  <SearchOutlined className="hero__search-icon" />
                  <input
                    type="text"
                    placeholder="Vị trí, kỹ năng, công ty..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="hero__search-input"
                  />
                </div>
                <div className="hero__search-divider"></div>
                <div className="hero__search-field hero__search-field--location">
                  <EnvironmentOutlined className="hero__search-icon" />
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="hero__search-select"
                  >
                    <option value="">Tất cả địa điểm</option>
                    {LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="hero__search-btn" onClick={handleSearch}>
                  <SearchOutlined />
                  Tìm kiếm
                </button>
              </div>
            </div>

            {/* Quick tags */}
            <div className="hero__quick-tags">
              <span className="hero__quick-label">Tìm kiếm phổ biến:</span>
              {[
                "Frontend Developer",
                "Product Manager",
                "UI/UX Designer",
                "Data Engineer",
              ].map((tag) => (
                <button
                  key={tag}
                  className="hero__quick-tag"
                  onClick={() => {
                    setKeyword(tag);
                    navigate(`/jobs?keyword=${encodeURIComponent(tag)}`);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="home-stats">
        <div className="container">
          <div className="home-stats__grid">
            {[
              {
                icon: <SolutionOutlined />,
                value: statValue("totalJobs"),
                label: "Việc làm đang tuyển",
              },
              {
                icon: <TeamOutlined />,
                value: statValue("totalCompanies"),
                label: "Nhà tuyển dụng đã đăng ký",
              },
              {
                icon: <RocketOutlined />,
                value: statValue("totalCandidates"),
                label: "Ứng viên đã đăng ký",
              },
              {
                icon: <StarFilled />,
                value: statValue("verifiedCompanies"),
                label: "Doanh nghiệp đã xác thực",
              },
            ].map((stat) => (
              <div key={stat.label} className="home-stat-item">
                <div className="home-stat-icon">{stat.icon}</div>
                <div className="home-stat-number">{stat.value}</div>
                <div className="home-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CATEGORIES ===== */}
      <section className="page-section page-section-white home-categories">
        <div className="container">
          <div className="section-header">
            <div>
              <h2 className="section-title">Khám phá theo ngành nghề</h2>
              <p className="section-subtitle">
                Tìm việc làm theo lĩnh vực bạn quan tâm
              </p>
            </div>
            <button
              className="section-view-all"
              onClick={() => navigate("/jobs")}
            >
              Xem tất cả <RightOutlined />
            </button>
          </div>
          {overview && overview.categories.length === 0 && <Empty description="Chưa có ngành nghề đang tuyển" />}
          <Row gutter={[16, 16]}>
            {(overview?.categories || []).map((cat) => (
              <Col key={cat.key} xs={12} sm={8} md={6} lg={6}>
                <div
                  className="category-card"
                  onClick={() => navigate(`/jobs?category=${encodeURIComponent(cat.label)}`)}
                >
                  <span className="category-card__icon">💼</span>
                  <div className="category-card__label">{cat.label}</div>
                  <div className="category-card__count">
                    {cat.count.toLocaleString()} việc làm
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ===== HOT JOBS ===== */}
      <section className="page-section page-section-gray home-hot-jobs">
        <div className="container">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                <FireFilled style={{ color: "#ff6b35", marginRight: 8 }} />
                Việc làm nổi bật
              </h2>
              <p className="section-subtitle">
                Những cơ hội hấp dẫn đang chờ đón bạn
              </p>
            </div>
            <button
              className="section-view-all"
              onClick={() => navigate("/jobs")}
            >
              Xem tất cả <RightOutlined />
            </button>
          </div>

          {loadingJobs ? (
            <div className="home-loading">
              <Spin size="large" />
            </div>
          ) : hotJobs.length === 0 ? <Empty description="Chưa có việc làm nổi bật" /> : (
            <Row gutter={[20, 20]}>
              {hotJobs.map((job) => (
                <Col key={job._id || job.id} xs={24} sm={12} lg={8}>
                  <JobCard job={job} />
                </Col>
              ))}
            </Row>
          )}
        </div>
      </section>

      {/* ===== TOP COMPANIES ===== */}
      <section className="page-section page-section-white home-companies">
        <div className="container">
          <div className="section-header">
            <div>
              <h2 className="section-title">Nhà tuyển dụng đang hoạt động</h2>
              <p className="section-subtitle">
                Các công ty có nhiều vị trí đang tuyển
              </p>
            </div>
            <button
              className="section-view-all"
              onClick={() => navigate("/companies")}
            >
              Xem tất cả <RightOutlined />
            </button>
          </div>
          {overview && overview.companies.length === 0 && <Empty description="Chưa có công ty đang tuyển dụng" />}
          <Row gutter={[20, 20]}>
            {(overview?.companies || []).map((company) => (
              <Col key={company._id || company.id} xs={12} sm={8} md={6} lg={4}>
                <div className="company-card" role="link" tabIndex={0}
                  onClick={() => navigate(`/companies/${company._id}`)}
                  onKeyDown={(event) => { if (event.key === "Enter") navigate(`/companies/${company._id}`); }}>
                  <img
                    src={company.logo}
                    alt={company.companyName || company.name}
                    className="company-card__logo"
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.companyName || company.name || "Company")}&background=00b14f&color=fff`;
                    }}
                  />
                  <div className="company-card__name">
                    {company.companyName || company.name}
                  </div>
                  <div className="company-card__jobs">
                    {company.jobs} việc làm
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ===== WHY TOPCV ===== */}
      <section className="page-section page-section-gray home-why">
        <div className="container">
          <div className="section-header center">
            <h2 className="section-title">Tại sao chọn TopCV?</h2>
            <p className="section-subtitle">
              Kết nối ứng viên và nhà tuyển dụng
            </p>
          </div>
          <Row gutter={[32, 32]}>
            {[
              {
                icon: "🎯",
                title: "Hỗ trợ cải thiện CV",
                desc: "AI phân tích nội dung CV theo mô tả công việc và đề xuất cải thiện.",
              },
              {
                icon: "⚡",
                title: "Ứng tuyển nhanh chóng",
                desc: "Chỉ vài bước đơn giản để gửi CV đến nhà tuyển dụng mơ ước của bạn.",
              },
              {
                icon: "🏆",
                title: "Thông tin công ty rõ ràng",
                desc: "Xem ngành nghề, địa điểm và thông tin doanh nghiệp trước khi ứng tuyển.",
              },
              {
                icon: "📊",
                title: "Theo dõi hồ sơ ứng tuyển",
                desc: "Xem trạng thái xử lý hồ sơ do nhà tuyển dụng cập nhật.",
              },
            ].map((feature) => (
              <Col key={feature.title} xs={24} sm={12} md={6}>
                <div className="why-card">
                  <div className="why-card__icon">{feature.icon}</div>
                  <h3 className="why-card__title">{feature.title}</h3>
                  <p className="why-card__desc">{feature.desc}</p>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="home-cta">
        <div className="container">
          <div className="home-cta__content">
            <div className="home-cta__text">
              <h2>Bạn là nhà tuyển dụng?</h2>
              <p>
                Đăng tin tuyển dụng miễn phí và tiếp cận hàng triệu ứng viên
                chất lượng cao.
              </p>
              <div className="home-cta__checks">
                {[
                  "Đăng tin miễn phí",
                  "Tìm kiếm CV ứng viên",
                  "Quản lý tuyển dụng dễ dàng",
                ].map((item) => (
                  <div key={item} className="home-cta__check-item">
                    <CheckCircleFilled />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="home-cta__btns">
                <Button
                  type="primary"
                  size="large"
                  onClick={() => navigate("/employer/dashboard")}
                  style={{ height: 48, paddingInline: 32, fontWeight: 700 }}
                >
                  Đăng tin ngay
                </Button>
                <Button
                  size="large"
                  style={{
                    height: 48,
                    paddingInline: 32,
                    fontWeight: 600,
                    borderColor: "rgba(255,255,255,0.4)",
                    color: "white",
                    background: "rgba(255,255,255,0.1)",
                  }}
                >
                  Tìm hiểu thêm
                </Button>
              </div>
            </div>
            <div className="home-cta__visual">
              <div className="home-cta__card-preview">
                <div className="cta-preview-stat">
                  <span className="cta-preview-num">125K+</span>
                  <span>Hồ sơ ứng viên</span>
                </div>
                <div className="cta-preview-stat">
                  <span className="cta-preview-num">18K+</span>
                  <span>Doanh nghiệp</span>
                </div>
                <div className="cta-preview-stat">
                  <span className="cta-preview-num">98%</span>
                  <span>Hài lòng</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
