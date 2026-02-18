
import React, { useState } from 'react';
import { UserAccount } from '../types';
import { AuthService, AcademyService } from '../services/api';

interface SignupViewProps {
  onBack: () => void;
}

const SignupView: React.FC<SignupViewProps> = ({ onBack }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    id: '',
    password: '',
    name: '',
    school: '',
    grade: '',
    phone: '',
    role: 'STUDENT',
    academyId: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRoleChange = (role: 'STUDENT' | 'TEACHER') => {
    setFormData({ ...formData, role });
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!formData.name || !formData.phone) {
        setError('필수 정보를 입력해주세요.');
        return;
      }

      // 선생님인 경우 학원 코드 필수, 학생인 경우 학년/학교 필수
      if (formData.role === 'TEACHER') {
        if (!formData.academyId) {
          setError('학원 코드를 입력해주세요.');
          return;
        }

        // 학원 코드 검증
        setIsSubmitting(true);
        const academy = await AcademyService.validateAcademyCode(formData.academyId);
        setIsSubmitting(false);

        if (!academy) {
          setError('유효하지 않은 학원 코드입니다.');
          return;
        }

        // 유효한 학원인 경우 확인 메시지 (선택 사항)
        // alert(`${academy.name} 소속으로 확인되었습니다.`);
      }

      if (formData.role === 'STUDENT') {
        if (!formData.school || !formData.grade) {
          setError('학교와 학년을 입력해주세요.');
          return;
        }
        if (!formData.parentPhone) {
          setError('학부모 연락처를 입력해주세요.');
          return;
        }
      }

      setError('');
      setStep(2);
    }
  };

  const handleSignup = async () => {
    if (!formData.id || !formData.password) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    if (formData.password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 선생님일 경우 학원 ID 조회 (코드 -> ID 변환)
      let finalAcademyId = formData.academyId;
      if (formData.role === 'TEACHER') {
        const academy = await AcademyService.validateAcademyCode(formData.academyId);
        if (academy) {
          finalAcademyId = academy.id;
        } else {
          setError('학원 코드가 유효하지 않습니다.');
          setIsSubmitting(false);
          return;
        }
      }

      const newUser: UserAccount = {
        ...formData,
        academyId: finalAcademyId, // 실제 ID로 저장
        role: formData.role as 'STUDENT' | 'TEACHER' | 'ADMIN', // 타입 단언
        signupDate: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
      };

      const success = await AuthService.signup(newUser);

      if (success) {
        alert('회원가입이 완료되었습니다! 로그인해주세요.');
        onBack();
      } else {
        setError('이미 존재하는 아이디입니다.');
      }
    } catch (e: any) {
      // ... existing error handling
      if (e?.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 아이디입니다.');
      } else {
        setError(e.message || '회원가입 중 오류가 발생했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header logic same as before */}
      <div className="flex items-center bg-white p-4 pb-2 justify-between sticky top-0 z-10">
        <div
          onClick={step === 1 ? onBack : () => setStep(1)}
          className="text-[#111418] flex size-12 shrink-0 items-center cursor-pointer"
        >
          <span className="material-symbols-outlined">arrow_back_ios</span>
        </div>
        <h2 className="text-[#111418] text-lg font-bold flex-1 text-center pr-12">
          {step === 1 ? '정보 입력' : '계정 생성'}
        </h2>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* Progress Bar same as before */}
        <div className="flex gap-6 justify-between">
          <p className="text-[#111418] text-base font-medium">{step}/2 단계</p>
          <p className="text-primary text-sm font-bold">{step === 1 ? '개인정보' : '로그인 정보'}</p>
        </div>
        <div className="rounded-full bg-[#dbe0e6] h-2">
          <div
            className="h-2 rounded-full bg-primary transition-all duration-300"
            style={{ width: step === 1 ? '50%' : '100%' }}
          ></div>
        </div>
      </div>

      {error && (
        <div className="mx-4 p-3 bg-red-50 text-red-500 text-sm rounded-xl text-center font-medium">
          {error}
        </div>
      )}

      {step === 1 ? (
        <div className="flex flex-col gap-1 pb-24 px-4 space-y-4 pt-4">

          {/* Role Selection */}
          <div className="flex flex-col">
            <p className="text-[#111418] text-sm font-bold pb-2">회원 유형</p>
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => handleRoleChange('STUDENT')}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${formData.role === 'STUDENT' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'
                  }`}
              >
                학생
              </button>
              <button
                onClick={() => handleRoleChange('TEACHER')}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${formData.role === 'TEACHER' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'
                  }`}
              >
                선생님
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <p className="text-[#111418] text-sm font-bold pb-2">이름</p>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="이름을 입력하세요"
              type="text"
            />
          </div>

          {/* Conditional Fields based on Role */}
          {formData.role === 'STUDENT' ? (
            <>
              <div className="flex flex-col">
                <p className="text-[#111418] text-sm font-bold pb-2">학교명</p>
                <div className="relative">
                  <input
                    name="school"
                    value={formData.school}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="학교 이름을 입력하세요"
                    type="text"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <p className="text-[#111418] text-sm font-bold pb-2">학년</p>
                <select
                  name="grade"
                  value={formData.grade}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base appearance-none focus:ring-2 focus:ring-primary/20 outline-none bg-white"
                >
                  <option value="">학년을 선택하세요</option>
                  <option>초등 1학년</option>
                  <option>초등 2학년</option>
                  <option>초등 3학년</option>
                  <option>초등 4학년</option>
                  <option>초등 5학년</option>
                  <option>초등 6학년</option>
                  <option>중등 1학년</option>
                  <option>중등 2학년</option>
                  <option>중등 3학년</option>
                </select>
              </div>

              <div className="flex flex-col">
                <p className="text-[#111418] text-sm font-bold pb-2">학부모 연락처 <span className="text-red-500">*</span></p>
                <input
                  name="parentPhone"
                  value={(formData as any).parentPhone || ''}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="보호자 전화번호 (- 없이 입력)"
                  type="tel"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col">
              <p className="text-[#111418] text-sm font-bold pb-2">학원 코드</p>
              <input
                name="academyId"
                value={formData.academyId}
                onChange={handleChange}
                className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="학원 고유 코드를 입력하세요"
                type="text"
              />
              <p className="text-xs text-gray-400 mt-1 pl-1">* 원장님께 전달받은 코드를 입력해주세요.</p>
            </div>
          )}

          <div className="flex flex-col">
            <p className="text-[#111418] text-sm font-bold pb-2">연락처</p>
            <input
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="'-' 없이 번호만 입력"
              type="tel"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 pb-24 px-4 space-y-4 pt-4">
          <div className="flex flex-col">
            <p className="text-[#111418] text-sm font-bold pb-2">아이디</p>
            <input
              name="id"
              value={formData.id}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="사용할 아이디를 입력하세요"
              type="text"
            />
          </div>
          <div className="flex flex-col">
            <p className="text-[#111418] text-sm font-bold pb-2">비밀번호</p>
            <input
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="비밀번호를 입력하세요"
              type="password"
            />
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 max-w-md mx-auto">
        <button
          onClick={step === 1 ? handleNext : handleSignup}
          disabled={isSubmitting}
          className="w-full bg-primary text-white font-bold py-4 rounded-xl text-lg shadow-lg shadow-primary/20 disabled:bg-gray-300 flex items-center justify-center gap-2"
        >
          {isSubmitting && <span className="material-symbols-outlined animate-spin text-sm">refresh</span>}
          {step === 1 ? '다음 단계로' : '가입 완료하기'}
        </button>
      </div>
    </div>
  );
};

export default SignupView;
