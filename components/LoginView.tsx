
import React, { useState } from 'react';
import { UserAccount } from '../types';
import { AuthService } from '../services/api';

interface LoginViewProps {
  onLogin: (user: UserAccount) => void;
  onGoSignup: () => void;
}

const LOGO_URL = "https://lh3.googleusercontent.com/u/0/d/16S6A8l-NgtMiOb8mjf1-hLv0AgxnX-dc=w1000-h1000";

const LoginView: React.FC<LoginViewProps> = ({ onLogin, onGoSignup }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setError('');
    setIsLoading(true);

    try {
      if (!userId || !password) {
        throw new Error('아이디와 비밀번호를 입력해주세요.');
      }

      const user = await AuthService.login(userId, password);

      if (user) {
        onLogin(user);
      } else {
        throw new Error('회원 정보가 일치하지 않습니다.');
      }
    } catch (err: any) {
      setError(err.message || '로그인 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSignIn();
  };

  return (
    <div className="flex min-h-screen w-full bg-white overflow-hidden font-display">
      {/* Left: Branding Section (Visible on Tablet/Desktop - md and up) */}
      <div className="hidden md:flex flex-[1.1] lg:flex-[1.2] bg-navy relative items-center justify-center p-8 lg:p-16">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-navy to-navy"></div>
        <div className="relative z-10 max-w-2xl text-center">
          <div className="mb-8 lg:mb-12 animate-float">
            <img
              src={LOGO_URL}
              alt="가치인 로고"
              className="w-48 h-48 lg:w-72 lg:h-72 object-contain mx-auto logo-shadow"
            />
          </div>
          <h1 className="text-white text-3xl lg:text-5xl font-black mb-6 lg:mb-8 leading-tight tracking-tight break-keep">
            성과와 사람됨을 동시에 얻는(Gain)<br />
            <span className="text-primary">All-in-One</span> 교육 브랜드
          </h1>
          <p className="text-white/70 text-base lg:text-xl font-medium mb-10 lg:mb-16 leading-relaxed break-keep">
            "수행평가 만점의 비밀은 깊이 있는 독서와 토론에 있습니다."<br />
            가치 있는 사람으로 이끄는 교육의 여정을 지금 시작하세요.
          </p>

          <div className="grid grid-cols-3 gap-3 lg:gap-6">
            <div className="bg-white/5 backdrop-blur-md rounded-2xl lg:rounded-3xl p-4 lg:p-6 border border-white/10">
              <span className="text-secondary text-2xl lg:text-4xl font-black block mb-1 lg:mb-2">人</span>
              <p className="text-white font-bold text-sm lg:text-lg mb-0.5 lg:mb-1">Integrity</p>
              <p className="text-white/40 text-[10px] lg:text-xs">가치 있는 사람</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl lg:rounded-3xl p-4 lg:p-6 border border-white/10">
              <span className="text-primary text-2xl lg:text-4xl font-black block mb-1 lg:mb-2">引</span>
              <p className="text-white font-bold text-sm lg:text-lg mb-0.5 lg:mb-1">Guidance</p>
              <p className="text-white/40 text-[10px] lg:text-xs">성과로의 견인</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl lg:rounded-3xl p-4 lg:p-6 border border-white/10">
              <span className="text-white text-2xl lg:text-4xl font-black block mb-1 lg:mb-2">in</span>
              <p className="text-white font-bold text-sm lg:text-lg mb-0.5 lg:mb-1">Integration</p>
              <p className="text-white/40 text-[10px] lg:text-xs">올인원 시스템</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Login Section */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 md:px-12 lg:px-24 bg-background-light">
        <div className="w-full max-w-md">
          {/* Mobile Only Logo & Slogan (Hidden on md and up) */}
          <div className="md:hidden text-center mb-10">
            <img
              src={LOGO_URL}
              className="w-32 h-32 mx-auto mb-4 object-contain logo-shadow"
              alt="로고"
            />
            <h2 className="text-navy text-xl font-black tracking-tight mb-1">Gachi In Literacy</h2>
            <p className="text-gray-400 font-bold text-xs">성과와 사람됨을 함께 키우는 교육</p>
          </div>

          {/* Tablet/Desktop Greeting (Visible on md and up) */}
          <div className="hidden md:block mb-10 lg:mb-12">
            <h2 className="text-navy text-3xl lg:text-4xl font-black mb-2 lg:mb-3 tracking-tight">반갑습니다!</h2>
            <p className="text-gray-500 font-bold text-base lg:text-lg">가치인 시스템에 접속하여 성장을 확인하세요.</p>
          </div>

          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-sm font-bold border border-red-100 mb-6">
                {error}
              </div>
            )}

            <div className="relative group">
              <span className="absolute left-5 top-5 text-gray-400 group-focus-within:text-primary transition-colors">
                <span className="material-symbols-outlined">person</span>
              </span>
              <input
                className="w-full rounded-[1.5rem] border-gray-100 bg-white h-16 pl-14 pr-6 text-lg focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all border font-medium"
                placeholder="아이디"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            <div className="relative group">
              <span className="absolute left-5 top-5 text-gray-400 group-focus-within:text-primary transition-colors">
                <span className="material-symbols-outlined">lock</span>
              </span>
              <input
                className="w-full rounded-[1.5rem] border-gray-100 bg-white h-16 pl-14 pr-6 text-lg focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all border font-medium"
                placeholder="비밀번호"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full bg-navy text-white font-black h-16 rounded-[1.5rem] text-xl transition-all shadow-xl shadow-navy/20 hover:bg-[#001e40] active:scale-[0.98] mt-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? <span className="material-symbols-outlined animate-spin">refresh</span> : '로그인'}
            </button>

            <div className="relative py-6 lg:py-8 flex items-center">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="flex-shrink mx-4 text-gray-300 text-[10px] font-black tracking-widest uppercase italic">OR</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            <button
              onClick={onGoSignup}
              className="w-full bg-primary text-white font-black h-16 rounded-[1.5rem] text-xl transition-all shadow-xl shadow-primary/20 hover:brightness-105 active:scale-[0.98]"
            >
              문해력 진단 및 회원가입
            </button>
          </div>



          <p className="mt-8 lg:mt-10 text-center text-gray-300 text-[10px] font-bold tracking-tighter">
            © 2025 Y'S WORKS | GACHI IN. All rights reserved.
          </p>
        </div>
      </div>
    </div >
  );
};

export default LoginView;
