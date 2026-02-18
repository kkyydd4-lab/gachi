import React from 'react';

interface SettingsModalProps {
    onClose: () => void;
    cloudProvider: 'GOOGLE_DRIVE' | 'FIREBASE';
    setCloudProvider: (provider: 'GOOGLE_DRIVE' | 'FIREBASE') => void;
    inputClientId: string;
    setInputClientId: (id: string) => void;
    inputApiKey: string;
    setInputApiKey: (key: string) => void;
    handleSaveSettings: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    onClose,
    cloudProvider,
    setCloudProvider,
    inputClientId,
    setInputClientId,
    inputApiKey,
    setInputApiKey,
    handleSaveSettings
}) => {
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

                    {/* Provider Selection */}
                    <div>
                        <label className="block text-navy font-bold text-sm mb-2">클라우드 동기화 제공자 (Backend Provider)</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setCloudProvider('GOOGLE_DRIVE')}
                                className={`p-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 ${cloudProvider === 'GOOGLE_DRIVE' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-400'}`}
                            >
                                <span className="material-symbols-outlined">add_to_drive</span>
                                Google Drive
                            </button>
                            <button
                                onClick={() => setCloudProvider('FIREBASE')}
                                className={`p-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 ${cloudProvider === 'FIREBASE' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-gray-200 text-gray-400'}`}
                            >
                                <span className="material-symbols-outlined">local_fire_department</span>
                                Firebase
                            </button>
                        </div>
                    </div>

                    {cloudProvider === 'GOOGLE_DRIVE' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl text-xs text-yellow-800 font-medium leading-relaxed">
                                ⚠️ <strong>Drive 설정:</strong> "Access Blocked" 오류 시, 본인의 Google Cloud Client ID를 입력하세요.
                            </div>

                            <div>
                                <label className="block text-navy font-bold text-sm mb-2">Google Client ID</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                    placeholder="000000000000-xxxx.apps.googleusercontent.com"
                                    value={inputClientId}
                                    onChange={(e) => setInputClientId(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-navy font-bold text-sm mb-2">Google API Key</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                    placeholder="AIzaSy..."
                                    value={inputApiKey}
                                    onChange={(e) => setInputApiKey(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {cloudProvider === 'FIREBASE' && (
                        <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl text-xs text-orange-800 font-medium leading-relaxed animate-fade-in">
                            🔥 <strong>Firebase 설정:</strong> 현재 준비 중인 기능입니다. 추후 코드(api.ts)에 Firebase Config를 추가하면 즉시 활성화됩니다.
                        </div>
                    )}

                    <button
                        onClick={handleSaveSettings}
                        className="w-full bg-primary text-white font-black py-4 rounded-xl shadow-lg shadow-primary/20 hover:brightness-105 active:scale-95 transition-all mt-4"
                    >
                        설정 저장 및 새로고침
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
