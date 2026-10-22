// ===========================

// Card hiển thị 1 tin tuyển dụng
// ===========================

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Tag, Tooltip, message } from "antd";
import {
  EnvironmentOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  HeartFilled,
  FireFilled,
  ThunderboltFilled,
} from "@ant-design/icons";
import { formatSalary, timeAgo, getJobTypeLabel } from "../../utils/formatters";
import jobService from "../../services/jobService";
import { useAuth } from "../../hooks/useAuth";
import "./JobCard.css";

const JobCard = ({ job, view = "list" }) => {
  const { isAuthenticated, user, updateUser } = useAuth();
  const jobId = String(job._id || job.id);
  const savedFromServer = typeof job.isSaved === "boolean" ? job.isSaved :
    (user?.savedJobs || []).some((item) => String(item?._id || item?.id || item) === jobId);
  const [saved, setSaved] = useState(savedFromServer);
  useEffect(() => setSaved(savedFromServer), [jobId, savedFromServer]);
  const [savingLoading, setSavingLoading] = useState(false);
  const jobTypeInfo = getJobTypeLabel(job.jobType);

  const company = job.companySnapshot || job.company || {};

 
  const skills = job.skills || [];

  const handleSave = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      message.warning("Vui lòng đăng nhập để lưu việc làm");
      return;
    }
    if (user?.role !== "candidate") {
      message.warning("Chỉ ứng viên mới có thể lưu việc làm");
      return;
    }
    setSavingLoading(true);
    try {
      const result = await jobService.saveJob(jobId, !saved);
      setSaved(result.isSaved);
      updateUser((current) => {
        const others = (current.savedJobs || []).filter((item) => String(item?._id || item?.id || item) !== jobId);
        return { savedJobs: result.isSaved ? [...others, job] : others };
      });
      message.success(result.isSaved ? "Đã lưu việc làm" : "Đã bỏ lưu việc làm");
    } catch {
      message.error("Có lỗi xảy ra, thử lại sau");
    } finally {
      setSavingLoading(false);
    }
  };

  return (
    
    <Link
      to={`/jobs/${job._id || job.id}`}
      className={`job-card job-card--${view}`}
    >
      <div className="job-card__inner">
        {/* Badges */}
        <div className="job-card__badges">
          {job.urgent && (
            <span className="job-badge job-badge--urgent">
              <ThunderboltFilled /> Gấp
            </span>
          )}
          {job.hot && (
            <span className="job-badge job-badge--hot">
              <FireFilled /> Hot
            </span>
          )}
        </div>

        {/* Save button */}
        <Tooltip title={saved ? "Bỏ lưu" : "Lưu việc làm"}>
          <button
            className={`job-card__save ${saved ? "saved" : ""}`}
            onClick={handleSave}
            disabled={savingLoading}
          >
            {saved ? <HeartFilled /> : <HeartOutlined />}
          </button>
        </Tooltip>

        {/* Company logo */}
        <div className="job-card__logo-wrap">
          <img
            src={company.logo || "/company-placeholder.svg"}
            alt={company.companyName || company.name}
            className="job-card__logo"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/company-placeholder.svg";
            }}
          />
          {company.verified && (
            <span className="job-card__verified" title="Công ty đã xác thực">
              ✓
            </span>
          )}
        </div>

        {/* Content */}
        <div className="job-card__content">
          <h3 className="job-card__title">{job.title}</h3>
          <p className="job-card__company">
            {company.companyName || company.name}
          </p>

          <div className="job-card__meta">
            <div className="job-card__meta-item">
              <DollarOutlined className="job-card__meta-icon salary" />
              <span className="job-card__salary">
                {formatSalary(job.salary)}
              </span>
            </div>
            <div className="job-card__meta-item">
              <EnvironmentOutlined className="job-card__meta-icon" />
              <span>{job.location}</span>
            </div>
            <div className="job-card__meta-item">
              <ClockCircleOutlined className="job-card__meta-icon" />
              {/* Fallback ngày tạo nếu postedAt không có */}
              <span>{timeAgo(job.postedAt || job.createdAt)}</span>
            </div>
          </div>

          <div className="job-card__skills">
            {skills.slice(0, 3).map((skill) => (
              <span key={skill} className="job-card__skill-tag">
                {skill}
              </span>
            ))}
            {skills.length > 3 && (
              <span className="job-card__skill-more">+{skills.length - 3}</span>
            )}
          </div>

          <div className="job-card__footer">
            <Tag
              color={jobTypeInfo.color}
              style={{ borderRadius: 4, fontWeight: 500, fontSize: 12 }}
            >
              {jobTypeInfo.label}
            </Tag>
            <span className="job-card__deadline">
              {job.deadline
                ? `Hết hạn: ${new Date(job.deadline).toLocaleDateString("vi-VN")}`
                : "Không thời hạn"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default JobCard;
