
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import LoginView from '@/components/LoginView';
import SignupView from '@/components/SignupView';
import ReportView from '@/components/ReportView';
import DiagnosticView from '@/components/DiagnosticView';
import AdminView from '@/components/AdminView';
import TeacherDashboard from '@/components/TeacherDashboard';
import { UserAccount } from '@/types';
import { AuthService } from '@/services/api';
import { useAuthStore } from '@/stores/useAuthStore';

const App: React.FC = () => {
  const { user: currentUser, isLoading, login, logout, initAuth, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Redirect to appropriate dashboard on root access
  useEffect(() => {
    if (!isLoading && currentUser && location.pathname === '/') {
      if (currentUser.role === 'TEACHER') navigate('/teacher');
      else if (currentUser.role === 'ADMIN') navigate('/admin');
      else navigate('/report');
    } else if (!isLoading && !currentUser && location.pathname === '/') {
      navigate('/login');
    }
  }, [isLoading, currentUser, location, navigate]);


  const handleLogin = (user: UserAccount) => {
    login(user);

    // 역할별 라우팅
    if (user.role === 'TEACHER') {
      navigate('/teacher');
    } else if (user.role === 'ADMIN') {
      navigate('/admin');
    } else {
      navigate('/report');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleTestComplete = async (result: NonNullable<UserAccount['testResult']>) => {
    if (!currentUser) return;

    // 기존 히스토리에 새 결과 추가
    const existingHistory = currentUser.testHistory || [];
    const updatedHistory = [...existingHistory, result];

    const updatedUser = {
      ...currentUser,
      testResult: result,           // 최신 결과
      testHistory: updatedHistory   // 전체 히스토리
    };

    // Update global state and local storage
    updateUser(updatedUser);

    // Update "Backend" via Service
    await AuthService.updateUserResult(updatedUser);

    navigate('/report');
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background-light flex flex-col font-display">
      <Routes>
        <Route path="/login" element={!currentUser ? <LoginView onLogin={handleLogin} onGoSignup={() => navigate('/signup')} /> : <Navigate to="/" />} />
        <Route path="/signup" element={!currentUser ? <SignupView onBack={() => navigate('/login')} /> : <Navigate to="/" />} />

        <Route path="/diagnostic" element={currentUser ? <DiagnosticView user={currentUser} onComplete={handleTestComplete} onCancel={() => navigate('/report')} /> : <Navigate to="/login" />} />

        <Route path="/report" element={currentUser ? <ReportView user={currentUser} currentView="REPORT" setView={(view: any) => navigate(view === 'DIAGNOSTIC' ? '/diagnostic' : '/report')} onLogout={handleLogout} onStartTest={() => navigate('/diagnostic')} /> : <Navigate to="/login" />} />

        <Route path="/admin" element={currentUser && currentUser.role === 'ADMIN' ? <AdminView onBack={() => navigate('/login')} /> : <Navigate to={currentUser ? "/" : "/login"} />} />

        <Route path="/teacher" element={currentUser && currentUser.role === 'TEACHER' ? <TeacherDashboard user={currentUser} onLogout={handleLogout} /> : <Navigate to={currentUser ? "/" : "/login"} />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
};

export default App;
