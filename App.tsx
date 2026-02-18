
import React, { useState, useEffect } from 'react';
import LoginView from './components/LoginView';
import SignupView from './components/SignupView';
import ReportView from './components/ReportView';
import DiagnosticView from './components/DiagnosticView';
import AdminView from './components/AdminView';
import TeacherDashboard from './components/TeacherDashboard';
import { ViewState, UserAccount } from './types';
import { AuthService } from './services/api';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('LOGIN');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  useEffect(() => {
    const savedSession = localStorage.getItem('literacy_session');
    if (savedSession) {
      const user = JSON.parse(savedSession);
      setCurrentUser(user);
      // 역할에 따른 초기 뷰 설정
      if (user.role === 'TEACHER') {
        setCurrentView('TEACHER');
      } else if (user.role === 'ADMIN') {
        setCurrentView('ADMIN');
      } else {
        setCurrentView('REPORT');
      }
    }
  }, []);

  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    localStorage.setItem('literacy_session', JSON.stringify(user));

    // 역할별 라우팅
    if (user.role === 'TEACHER') {
      setCurrentView('TEACHER');
    } else if (user.role === 'ADMIN') {
      setCurrentView('ADMIN');
    } else {
      setCurrentView('REPORT');
    }
  };

  // ... existing code ...



  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('literacy_session');
    setCurrentView('LOGIN'); // 로그아웃 시 로그인 화면으로
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

    // Update local state
    setCurrentUser(updatedUser);
    localStorage.setItem('literacy_session', JSON.stringify(updatedUser));

    // Update "Backend" via Service
    await AuthService.updateUserResult(updatedUser);

    setCurrentView('REPORT');
  };

  const renderView = () => {
    switch (currentView) {
      case 'LOGIN':
        return <LoginView onLogin={handleLogin} onGoSignup={() => setCurrentView('SIGNUP')} />;
      case 'SIGNUP':
        return <SignupView onBack={() => setCurrentView('LOGIN')} />;
      case 'DIAGNOSTIC':
        return <DiagnosticView user={currentUser} onComplete={handleTestComplete} onCancel={() => setCurrentView('REPORT')} />;
      case 'REPORT':
        return <ReportView user={currentUser} currentView={currentView} setView={setCurrentView} onLogout={handleLogout} onStartTest={() => setCurrentView('DIAGNOSTIC')} />;
      case 'ADMIN':
        return <AdminView onBack={() => setCurrentView('LOGIN')} />;
      case 'TEACHER':
        return currentUser ? <TeacherDashboard user={currentUser} onLogout={handleLogout} /> : <LoginView onLogin={handleLogin} onGoSignup={() => setCurrentView('SIGNUP')} />;
      default:
        // ... existing default case
        return (
          <div className="flex flex-col items-center justify-center h-screen bg-white p-6 text-center">
            <p className="text-gray-500 mb-4 font-medium">{currentView} 화면 준비 중</p>
            <button onClick={() => setCurrentView('REPORT')} className="bg-primary text-white px-8 py-3 rounded-full font-bold shadow-lg">홈으로 이동</button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background-light flex flex-col font-display">
      {renderView()}
    </div>
  );
};

export default App;
