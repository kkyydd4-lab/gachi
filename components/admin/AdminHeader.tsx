import React from 'react';

interface AdminHeaderProps {
    onBack: () => void;
    isDriveConnected: boolean;
    cloudProvider: 'GOOGLE_DRIVE' | 'FIREBASE';
    isSyncing: boolean;
    handleDriveConnect: () => void;
    setShowSettingsModal: (show: boolean) => void;
    tab: string;
    setTab: (tab: any) => void;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({
    onBack,
    isDriveConnected,
    cloudProvider,
    isSyncing,
    handleDriveConnect,
    setShowSettingsModal,
    tab,
    setTab
}) => {
    return (
        <header className="bg-navy text-white shadow-xl sticky top-0 z-50">
            <div className="max-w-6xl mx-auto p-4 md:p-6">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div>
                            <h1 className="text-xl font-black tracking-tight">문해력 출제 관리자</h1>
                            <div className="flex items-center gap-2">
                                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Unified Curriculum Editor</p>
                                <span className="text-white/20">|</span>
                                {isDriveConnected ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                        {cloudProvider === 'GOOGLE_DRIVE' ? 'Drive Sync On' : 'Firebase On'}
                                    </span>
                                ) : (
                                    <button
                                        onClick={handleDriveConnect}
                                        disabled={isSyncing}
                                        className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white bg-white/10 px-2 py-0.5 rounded-full hover:bg-white/20 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-xs">cloud_off</span>
                                        {isSyncing ? 'Connecting...' : `Connect ${cloudProvider === 'GOOGLE_DRIVE' ? 'Drive' : 'Firebase'}`}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setShowSettingsModal(true)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all">
                        <span className="material-symbols-outlined text-lg">settings</span>
                    </button>
                </div>

                {/* 탭 네비게이션 */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    <button data-tab="dashboard" onClick={() => setTab('dashboard')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${tab === 'dashboard' ? 'bg-white text-navy shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                        <span className="material-symbols-outlined text-sm mr-1 align-middle">dashboard</span>
                        대시보드
                    </button>
                    <button data-tab="generate" onClick={() => setTab('generate')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${tab === 'generate' ? 'bg-primary text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                        <span className="material-symbols-outlined text-sm mr-1 align-middle">auto_fix_high</span>
                        문항 생성
                    </button>
                    <button onClick={() => setTab('review')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${tab === 'review' ? 'bg-secondary text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                        <span className="material-symbols-outlined text-sm mr-1 align-middle">fact_check</span>
                        문항 검토
                    </button>
                    <button onClick={() => setTab('analytics')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${tab === 'analytics' ? 'bg-secondary text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                        <span className="material-symbols-outlined text-sm mr-1 align-middle">analytics</span>
                        분석
                    </button>
                    <div className="flex-1"></div>
                    <button onClick={() => setTab('users')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${tab === 'users' ? 'bg-gray-600 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>
                        회원
                    </button>
                    <button onClick={() => setTab('academy')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${tab === 'academy' ? 'bg-gray-600 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>
                        학원
                    </button>
                </div>
            </div>
        </header>
    );
};

export default AdminHeader;
