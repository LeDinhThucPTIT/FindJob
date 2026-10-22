import React, { lazy, Suspense } from "react";
import { Spin } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import AuthLayout from "./layouts/AuthLayout";
const HomePage = lazy(() => import("./pages/HomePage"));
const JobListPage = lazy(() => import("./pages/JobListPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const EmployerDashboardPage = lazy(() => import("./pages/EmployerDashboardPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/common/ProtectedRoute";
const CompaniesPage = lazy(() => import("./pages/CompaniesPage"));
const CVPage = lazy(() => import("./pages/CVPage"));
const BecomeEmployerPage = lazy(() => import("./pages/BecomeEmployerPage"));
const CompanyDetailPage = lazy(() => import("./pages/CompanyDetailPage"));
const CvscoringPage = lazy(() => import("./pages/CvscoringPage"));
import EmployerLayout from "./layouts/EmployerLayout";
const ForgotPassPage = lazy(() => import("./pages/ForgotPassPage"));
import { GoogleOAuthProvider } from "@react-oauth/google";

const App = () => {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div style={{ padding: 80, textAlign: "center" }}><Spin size="large" /></div>}>
          <Routes>
            {/* Public routes with main layout */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/jobs" element={<JobListPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/companies"
                element={
                  <ProtectedRoute>
                    <CompaniesPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/companies/:id" element={<CompanyDetailPage />} />
              <Route
                path="/cv"
                element={
                  <ProtectedRoute requiredRole="candidate">
                    <CVPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cvscoring"
                element={
                  <ProtectedRoute requiredRole="candidate">
                    <CvscoringPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/become-employer" element={<BecomeEmployerPage />} />
            </Route>

            <Route element={<EmployerLayout />}>
              <Route
                path="/employer/dashboard"
                element={
                  <ProtectedRoute requiredRole="employer">
                    <EmployerDashboardPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Auth routes with minimal layout */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPassPage />} />
            </Route>

            {/* 404 */}
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
};

export default App;
