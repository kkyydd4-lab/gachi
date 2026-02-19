import React, { useState, useEffect } from 'react';
import { checkFirebaseConnection } from '../../services/firebase';

interface SettingsModalProps {
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const [firebaseStatus, setFirebaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');

    useEffect(() => {
        const check = async () => {
            setFirebaseStatus('checking');
            const ok = await checkFirebaseConnection();
            setFirebaseStatus(ok ? 'connected' : 'error');
        };
        check();
    }, []);

    const handleRetry = async () => {
        setFirebaseStatus('checking');
        const ok = await checkFirebaseConnection();
        setFirebaseStatus(ok ? 'connected' : 'error');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-float">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-navy text-white">
                    <h3 className="font-black text-lg flex items-center gap-2">
                        <span className="material-symbols-outlined">settings_applications</span>
                        시스템 설정
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-8 space-y-6">

                    {/* Firebase Status */}
                    <div>
                        <label className="block text-navy font-bold text-sm mb-3">백엔드 연결 상태</label>
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="material-symbols-outlined text-orange-500">local_fire_department</span>
                                <span className="text-navy font-bold">Firebase</span>
                                <div className="ml-auto flex items-center gap-2">
                                    {firebaseStatus === 'checking' && (
                                        <>
                                            <span className="material-symbols-outlined animate-spin text-gray-400 text-sm">sync</span>
                                            <span className="text-xs text-gray-400 font-bold">확인 중...</span>
                                        </>
                                    )}
                                    {firebaseStatus === 'connected' && (
                                        <>
                                            <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                                            <span className="text-xs text-green-600 font-bold">연결됨</span>
                                        </>
                                    )}
                                    {firebaseStatus === 'error' && (
                                        <>
                                            <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                                            <span className="text-xs text-red-600 font-bold">연결 실패</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                🔥 Firebase가 기본으로 연결되어 있습니다. 별도 설정 없이 인증, 데이터 저장, 분석 기능을 사용할 수 있습니다.
                            </p>
                            {firebaseStatus === 'error' && (
                                <button
                                    onClick={handleRetry}
                                    className="mt-3 text-xs text-primary font-bold underline hover:no-underline"
                                >
                                    다시 확인
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Gemini API Status */}
                    <div>
                        <label className="block text-navy font-bold text-sm mb-3">AI 엔진</label>
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="material-symbols-outlined text-blue-500">smart_toy</span>
                                <span className="text-navy font-bold">Gemini 3.0 Flash</span>
                                <span className="ml-auto bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">Preview</span>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                문항 생성에 사용되는 AI 모델입니다. Fallback: Gemini 2.5 Flash
                            </p>
                        </div>
                    </div>

                    {/* Info */}
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-xs text-blue-800 font-medium leading-relaxed">
                        💡 <strong>참고:</strong> 모든 설정은 코드에 내장되어 있어 별도로 변경할 필요가 없습니다.
                        문제가 발생하면 개발자에게 문의하세요.
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full bg-primary text-white font-black py-4 rounded-xl shadow-lg shadow-primary/20 hover:brightness-105 active:scale-95 transition-all mt-4"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
