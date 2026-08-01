
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import LoginView from '@/components/LoginView';
import SignupView from '@/components/SignupView';
import ReportView from '@/components/ReportView';
import DiagnosticView from '@/components/DiagnosticView';
import AdminView from '@/components/AdminView';
import TeacherDashboard from '@/components/TeacherDashboard';
import WritingView from '@/components/WritingView';
import ReadingLogView from '@/components/ReadingLogView';
import CareerView from '@/components/CareerView';
import PrintView from '@/components/print/PrintView';
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

  // 진단 결과 저장 (결과 계산 직후 즉시 호출 — 이전에는 결과 화면의 "홈으로" 버튼을
  // 눌러야만 저장되어, 새로고침/이탈 시 결과가 통째로 유실되는 문제가 있었음)
  const persistTestResult = async (result: NonNullable<UserAccount['testResult']>): Promise<boolean> => {
    if (!currentUser) return false;

    const updatedUser = {
      ...currentUser,
      testResult: result,
      testHistory: [...(currentUser.testHistory || []), result]
    };

    try {
      // 서버 저장을 먼저 확인한 뒤 로컬 상태 갱신 (실패했는데 성공한 것처럼 보이는 상태 방지)
      await AuthService.updateUserResult(updatedUser);
      updateUser(updatedUser);
      return true;
    } catch (e) {
      console.error('Test result persist failed:', e);
      return false;
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background-light flex flex-col font-display">
      <Routes>
        <Route path="/login" element={!currentUser ? <LoginView onLogin={handleLogin} onGoSignup={() => navigate('/signup')} /> : <Navigate to="/" />} />
        <Route path="/signup" element={!currentUser ? <SignupView onBack={() => navigate('/login')} /> : <Navigate to="/" />} />

        <Route path="/diagnostic" element={currentUser ? <DiagnosticView user={currentUser} onSaveResult={persistTestResult} onExit={() => navigate('/report')} onCancel={() => navigate('/report')} /> : <Navigate to="/login" />} />

        <Route path="/report" element={currentUser ? <ReportView user={currentUser} currentView="REPORT" setView={(view: any) => navigate(view === 'DIAGNOSTIC' ? '/diagnostic' : '/report')} onLogout={handleLogout} onStartTest={() => navigate('/diagnostic')} onOpenWriting={() => navigate('/writing')} onOpenReading={(book) => navigate('/reading', { state: book })} onOpenCareer={() => navigate('/career')} /> : <Navigate to="/login" />} />

        <Route path="/writing" element={currentUser ? <WritingView user={currentUser} onBack={() => navigate('/report')} /> : <Navigate to="/login" />} />

        <Route path="/reading" element={currentUser ? <ReadingLogView user={currentUser} onBack={() => navigate('/report')} /> : <Navigate to="/login" />} />

        <Route path="/career" element={currentUser ? <CareerView user={currentUser} onBack={() => navigate('/report')} onUserUpdated={updateUser} /> : <Navigate to="/login" />} />

        <Route path="/admin" element={currentUser && currentUser.role === 'ADMIN' ? <AdminView onBack={handleLogout} adminName={currentUser.name} /> : <Navigate to={currentUser ? "/" : "/login"} />} />

        <Route path="/teacher" element={currentUser && currentUser.role === 'TEACHER' ? <TeacherDashboard user={currentUser} onLogout={handleLogout} /> : <Navigate to={currentUser ? "/" : "/login"} />} />

        {/* 레이아웃 확인용 샘플 — 실제 학생 데이터가 없으므로 로그인 없이 열람 가능 */}
        <Route path="/print/sample" element={<PrintView sessionIdProp="sample" />} />

        {/* 평가지 인쇄 (관리자·교사 전용) */}
        <Route
          path="/print/:sessionId"
          element={
            currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'TEACHER')
              ? <PrintView />
              : <Navigate to={currentUser ? "/" : "/login"} />
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
};

export default App;
