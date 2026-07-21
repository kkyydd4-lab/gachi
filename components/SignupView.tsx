
import React, { useState } from 'react';
import { UserAccount } from '../types';
import { AuthService, AcademyService } from '../services/api';
import { getGradeSegment } from '../data/gradeSegments';

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
    parentPhone: '',
    role: 'STUDENT',
    academyId: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

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
        // 학생 학원 코드는 선택 — 입력했다면 유효해야 함
        if (formData.academyId) {
          setIsSubmitting(true);
          const academy = await AcademyService.validateAcademyCode(formData.academyId);
          setIsSubmitting(false);
          if (!academy) {
            setError('학원 코드가 올바르지 않아요. 학원에서 받은 코드를 다시 확인해주세요.');
            return;
          }
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

    if (!agreed) {
      setError('개인정보 수집·이용 및 AI 처리에 동의해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 학원 코드 → 실제 학원 ID 변환 (교사는 필수, 학생은 입력한 경우만)
      let finalAcademyId = formData.academyId;
      if (formData.academyId) {
        const academy = await AcademyService.validateAcademyCode(formData.academyId);
        if (academy) {
          finalAcademyId = academy.id;
        } else if (formData.role === 'TEACHER') {
          setError('학원 코드가 유효하지 않습니다.');
          setIsSubmitting(false);
          return;
        } else {
          finalAcademyId = ''; // 학생: 잘못된 코드는 미배정으로 (1단계에서 이미 검증되므로 방어적 처리)
        }
      }

      const newUser: UserAccount = {
        ...formData,
        academyId: finalAcademyId, // 실제 ID로 저장
        role: formData.role as 'STUDENT' | 'TEACHER' | 'ADMIN', // 타입 단언
        signupDate: new Date().toISOString(),
        consentAgreedAt: new Date().toISOString(), // 개인정보·AI 처리 동의 시각 기록
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

              {(() => {
                const segment = getGradeSegment(formData.grade);
                if (!segment) return null;
                return (
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-sm">
                    <p className="text-navy font-bold mb-1">{segment.rangeLabel} 학부모님이 가장 많이 하시는 고민</p>
                    <p className="text-gray-500">
                      "{segment.concern}" — 가치인의 <span className="text-primary font-bold">{segment.product}</span>으로 함께 준비해요.
                    </p>
                  </div>
                );
              })()}

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

              <div className="flex flex-col">
                <p className="text-[#111418] text-sm font-bold pb-2">학원 코드 <span className="text-gray-400 font-medium">(선택)</span></p>
                <input
                  name="academyId"
                  value={formData.academyId}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#dbe0e6] h-14 p-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="예: GACHI_A1B2"
                  type="text"
                />
                <p className="text-xs text-gray-400 mt-1 pl-1">* 다니는 학원에서 받은 코드를 입력하면 선생님과 연결돼요. 없으면 비워두세요.</p>
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

          {/* 개인정보·AI 처리 동의 (미성년자 대상 서비스 법적 요건) */}
          <div className="mt-2 rounded-xl border border-gray-200 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary/30 shrink-0"
              />
              <span className="text-sm text-[#111418] leading-relaxed">
                <b>[필수]</b> 개인정보 수집·이용 및 AI 처리에 동의합니다.
                <button type="button" onClick={() => setShowTerms(true)} className="text-primary font-bold underline ml-1">
                  전문 보기
                </button>
              </span>
            </label>
            <p className="text-xs text-gray-400 mt-2 pl-8 leading-relaxed">
              학생의 이름·학교·연락처와 제출한 글·독서 기록·손글씨 사진이 문해력 평가와 학습 리포트 생성을 위해
              수집되고 AI로 분석됩니다. 미성년자의 경우 보호자 동의가 필요합니다.
            </p>
          </div>
        </div>
      )}

      {/* 개인정보 처리방침 전문 모달 */}
      {showTerms && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={() => setShowTerms(false)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-black text-navy">개인정보 수집·이용 및 AI 처리 안내</h3>
              <button onClick={() => setShowTerms(false)}><span className="material-symbols-outlined text-gray-400">close</span></button>
            </div>
            <div className="p-6 overflow-y-auto text-sm text-gray-600 leading-relaxed space-y-4">
              <div>
                <p className="font-bold text-navy mb-1">1. 수집 항목</p>
                <p>이름, 학교, 학년, 학생·보호자 연락처, 소속 학원, 문해력 진단 응답·결과, 제출한 글과 손글씨 사진, 독서 기록.</p>
              </div>
              <div>
                <p className="font-bold text-navy mb-1">2. 이용 목적</p>
                <p>문해력 진단·평가, 글쓰기 첨삭, 성장 리포트 및 진로 탐색 리포트 생성, 학원의 학습 지도·상담.</p>
              </div>
              <div>
                <p className="font-bold text-navy mb-1">3. AI 처리</p>
                <p>제출한 글·손글씨 사진·진단 결과는 AI 모델을 통해 분석·요약됩니다. 처리 결과는 학생·보호자·담당 선생님에게 제공됩니다.</p>
              </div>
              <div>
                <p className="font-bold text-navy mb-1">4. 보유 기간 및 열람·삭제</p>
                <p>회원 탈퇴 또는 삭제 요청 시 관련 데이터를 파기합니다. 보호자는 자녀의 데이터 열람·정정·삭제를 요청할 수 있습니다.</p>
              </div>
              <div>
                <p className="font-bold text-navy mb-1">5. 미성년자 보호</p>
                <p>본 서비스는 미성년자를 대상으로 하며, 만 14세 미만은 보호자의 동의 하에 가입·이용해야 합니다.</p>
              </div>
              <p className="text-xs text-gray-400">※ 본 안내는 요약본입니다. 정식 개인정보 처리방침 전문은 학원을 통해 제공됩니다.</p>
            </div>
            <div className="p-5 border-t border-gray-100">
              <button
                onClick={() => { setAgreed(true); setShowTerms(false); }}
                className="w-full bg-primary text-white font-bold py-3 rounded-xl"
              >
                동의하고 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 max-w-md mx-auto">
        <button
          onClick={step === 1 ? handleNext : handleSignup}
          disabled={isSubmitting || (step === 2 && !agreed)}
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
