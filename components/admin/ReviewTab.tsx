import React, { useState } from 'react';
import { renderPassageContent } from '../../utils/renderPassageContent';
import { Asset, AdminConfig, LearningSession, LearningSessionStatus } from '../../types';

interface ReviewTabProps {
    config: AdminConfig;
    filteredAssets: Asset[];
    filterStatus: 'ALL' | 'CANDIDATE' | 'APPROVED' | 'REJECTED';
    setFilterStatus: (status: 'ALL' | 'CANDIDATE' | 'APPROVED' | 'REJECTED') => void;
    updateAssetStatus: (assetId: string, status: Asset['status']) => void;
    deleteAsset: (assetId: string) => void;
    bulkDeleteRejected: () => void;
    learningSessions: LearningSession[];
    updateLearningSessionStatus: (sessionId: string, status: LearningSessionStatus) => void;
    deleteLearningSession: (sessionId: string) => void;
    updateAsset?: (asset: Asset) => void;
}

const ReviewTab: React.FC<ReviewTabProps> = ({
    config,
    filteredAssets,
    filterStatus,
    setFilterStatus,
    updateAssetStatus,
    deleteAsset,
    bulkDeleteRejected,
    learningSessions,
    updateLearningSessionStatus,
    deleteLearningSession,
    updateAsset
}) => {
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

    // Helper: Bulk update session and its assets
    const handleSessionStatusChange = (session: LearningSession, status: LearningSessionStatus) => {
        updateLearningSessionStatus(session.sessionId, status);
        // Also update all assets in this session to match
        const assetStatus: Asset['status'] = status === 'APPROVED' ? 'APPROVED' : status === 'DRAFT' ? 'CANDIDATE' : 'REJECTED';
        session.assetIds.forEach(id => updateAssetStatus(id, assetStatus));
    };

    const getSessionAssets = (session: LearningSession) => {
        return session.assetIds.map(id => filteredAssets.find(a => a.assetId === id)).filter(Boolean) as Asset[];
    };

    return (
        <div className="space-y-6">
            <div className="bg-secondary/10 p-6 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h3 className="text-secondary font-black text-xl flex items-center gap-2">
                        <span className="material-symbols-outlined">fact_check</span>
                        문항 검토 및 승인
                    </h3>
                    <p className="text-gray-500 text-xs font-bold mt-1">
                        '승인(Approved)'된 문항만 실제 진단에 사용됩니다. 품질이 낮은 문항은 '반려'해주세요.
                    </p>
                </div>
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                    {(['CANDIDATE', 'APPROVED', 'REJECTED', 'ALL'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterStatus === status ? 'bg-navy text-white shadow-md' : 'text-gray-400 hover:text-navy'}`}
                        >
                            {status === 'CANDIDATE' ? '검토 대기' : status === 'APPROVED' ? '승인됨' : status === 'REJECTED' ? '반려됨' : '전체'}
                        </button>
                    ))}
                </div>
            </div>

            {/* 학년별 필터링 정보 및 반려함 관리 */}
            <div className="flex justify-between items-center px-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 font-bold">
                    <span className="material-symbols-outlined text-sm">filter_list</span>
                    {filterStatus === 'REJECTED' ? '반려 문항 보관함' : '문항 리스트'}
                    <span className="text-gray-300">|</span>
                    전체 {filteredAssets.length}개
                </div>

                {filterStatus === 'REJECTED' && filteredAssets.length > 0 && (
                    <button
                        onClick={bulkDeleteRejected}
                        className="flex items-center gap-1 text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">delete_forever</span>
                        반려 문항 전체 삭제
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6">
                {learningSessions
                    .filter(s => filterStatus === 'ALL' || (filterStatus === 'CANDIDATE' && s.status === 'DRAFT') || (filterStatus === 'APPROVED' && s.status === 'APPROVED') || (filterStatus === 'REJECTED' && s.status === 'ARCHIVED'))
                    .length === 0 ? (
                    <div className="text-center py-20 text-gray-300 font-bold">
                        {filterStatus === 'CANDIDATE' ? '검토 대기 중인 차시가 없습니다.' : '해당 조건의 차시가 없습니다.'}
                    </div>
                ) : (
                    learningSessions
                        .filter(s => filterStatus === 'ALL' || (filterStatus === 'CANDIDATE' && s.status === 'DRAFT') || (filterStatus === 'APPROVED' && s.status === 'APPROVED') || (filterStatus === 'REJECTED' && s.status === 'ARCHIVED'))
                        .map(session => (
                            <SessionCard
                                key={session.sessionId}
                                session={session}
                                assets={getSessionAssets(session)}
                                onUpdateStatus={(status) => handleSessionStatusChange(session, status)}
                                onDeleteSession={() => {
                                    if (confirm('이 차시를 영구 삭제하시겠습니까? 소속된 모든 지문도 함께 삭제됩니다.')) {
                                        deleteLearningSession(session.sessionId);
                                    }
                                }}
                                onOpenAssetDetail={setSelectedAsset}
                            />
                        ))
                )}
            </div>

            {/* 문항 상세 보기 모달 */}
            {selectedAsset && (
                <ReviewDetailModal
                    asset={selectedAsset}
                    onClose={() => setSelectedAsset(null)}
                    updateAssetStatus={updateAssetStatus}
                    updateAsset={updateAsset}
                />
            )}
        </div>
    );
};

interface ReviewDetailModalProps {
    asset: Asset;
    onClose: () => void;
    updateAssetStatus: (assetId: string, status: Asset['status']) => void;
    updateAsset?: (asset: Asset) => void;
}

const ReviewDetailModal: React.FC<ReviewDetailModalProps> = ({
    asset,
    onClose,
    updateAssetStatus,
    updateAsset
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedAsset, setEditedAsset] = useState<Asset>(asset);

    // Sync when asset changes (e.g. if updated from outside)
    React.useEffect(() => {
        setEditedAsset(asset);
    }, [asset]);

    const handleSave = () => {
        if (!updateAsset) return;
        updateAsset(editedAsset);
        setIsEditing(false);
    };

    const handleQuestionChange = (index: number, field: string, value: any) => {
        const newQuestions = [...editedAsset.questions];
        newQuestions[index] = { ...newQuestions[index], [field]: value };
        setEditedAsset({ ...editedAsset, questions: newQuestions });
    };

    const handleOptionChange = (qIndex: number, optIndex: number, value: string) => {
        const newQuestions = [...editedAsset.questions];
        const newOptions = [...newQuestions[qIndex].options];
        newOptions[optIndex] = value;
        newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions };
        setEditedAsset({ ...editedAsset, questions: newQuestions });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                {/* 모달 헤더 */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-navy text-white sticky top-0 z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black ${asset.status === 'APPROVED' ? 'bg-primary' : 'bg-gray-400'}`}>
                                {asset.status}
                            </span>
                            <span className="text-white/60 text-xs font-bold">{asset.gradeGroup} | {asset.subject}</span>
                        </div>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editedAsset.title}
                                onChange={(e) => setEditedAsset({ ...editedAsset, title: e.target.value })}
                                className="font-black text-xl text-navy bg-white px-2 py-1 rounded w-full"
                            />
                        ) : (
                            <h3 className="font-black text-xl">{asset.title}</h3>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {updateAsset && (
                            <button
                                onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                                className={`p-2 rounded-full transition-all ${isEditing ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                title={isEditing ? "저장" : "수정"}
                            >
                                <span className="material-symbols-outlined">{isEditing ? 'save' : 'edit'}</span>
                            </button>
                        )}
                        <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full text-white">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {/* 모달 콘텐츠 */}
                <div className="p-6 overflow-y-auto flex-1">
                    {/* 지문 */}
                    <div className="bg-gray-50 p-6 rounded-2xl mb-6">
                        <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-3">📖 지문</h4>
                        {isEditing ? (
                            <textarea
                                value={editedAsset.content}
                                onChange={(e) => setEditedAsset({ ...editedAsset, content: e.target.value })}
                                className="w-full h-60 p-4 border rounded-xl text-navy leading-relaxed focus:ring-2 focus:ring-primary focus:border-transparent resize-y"
                            />
                        ) : (
                            <p className="text-navy leading-relaxed whitespace-pre-wrap">{renderPassageContent(asset.content)}</p>
                        )}
                    </div>

                    {/* 문항 목록 */}
                    <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">📝 문항 ({asset.questions.length}개)</h4>
                    <div className="space-y-6">
                        {(isEditing ? editedAsset.questions : asset.questions).map((q, idx) => (
                            <div key={q.id || idx} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-start gap-4 mb-4">
                                    <span className="bg-navy text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 space-y-2">
                                        {isEditing ? (
                                            <>
                                                <input
                                                    type="text"
                                                    value={q.category}
                                                    onChange={(e) => handleQuestionChange(idx, 'category', e.target.value)}
                                                    className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded mb-2 w-32"
                                                />
                                                <textarea
                                                    value={q.question}
                                                    onChange={(e) => handleQuestionChange(idx, 'question', e.target.value)}
                                                    className="w-full p-2 border rounded font-bold text-navy"
                                                    rows={2}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full mb-2 inline-block">
                                                    {q.category}
                                                </span>
                                                <p className="text-navy font-bold mt-2">{q.question}</p>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Options */}
                                <div className="ml-12 space-y-2 mb-4">
                                    {q.options.map((opt, optIdx) => (
                                        <div
                                            key={optIdx}
                                            className={`p-3 rounded-xl text-sm flex items-center gap-2 ${optIdx + 1 === q.answer
                                                ? 'bg-primary/10 text-primary font-bold border-2 border-primary'
                                                : 'bg-gray-50 text-gray-600'
                                                }`}
                                        >
                                            <span className="font-bold mr-2">{'①②③④⑤'[optIdx]}</span>
                                            {isEditing ? (
                                                <div className="flex-1 flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={opt}
                                                        onChange={(e) => handleOptionChange(idx, optIdx, e.target.value)}
                                                        className="flex-1 bg-transparent border-b border-gray-300 focus:border-primary outline-none"
                                                    />
                                                    <input
                                                        type="radio"
                                                        name={`answer-${idx}`}
                                                        checked={optIdx + 1 === Number(q.answer)}
                                                        onChange={() => handleQuestionChange(idx, 'answer', optIdx + 1)}
                                                        className="w-4 h-4 ml-2"
                                                        title="정답으로 설정"
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    {opt}
                                                    {optIdx + 1 === q.answer && (
                                                        <span className="ml-2 text-xs bg-primary text-white px-2 py-0.5 rounded-full">정답</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* 해설 */}
                                {(q.rationale || isEditing) && (
                                    <div className="ml-12 p-4 bg-secondary/5 rounded-xl border border-secondary/20">
                                        <p className="text-xs font-bold text-secondary mb-1">💡 해설</p>
                                        {isEditing ? (
                                            <textarea
                                                value={q.rationale || ''}
                                                onChange={(e) => handleQuestionChange(idx, 'rationale', e.target.value)}
                                                className="w-full p-2 bg-white border rounded text-sm text-gray-600"
                                                rows={2}
                                                placeholder="해설을 입력하세요"
                                            />
                                        ) : (
                                            <p className="text-sm text-gray-600">{q.rationale}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 모달 푸터 */}
                <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50">
                    <p className="text-xs text-gray-400">생성일: {new Date(asset.createdAt).toLocaleString('ko-KR')}</p>
                    <div className="flex gap-2">
                        {asset.status !== 'APPROVED' && (
                            <button
                                onClick={() => {
                                    if (isEditing) handleSave();
                                    updateAssetStatus(asset.assetId, 'APPROVED');
                                    onClose();
                                }}
                                className="px-6 py-3 rounded-xl font-bold text-sm bg-primary text-white hover:brightness-105 transition-all"
                            >
                                {isEditing ? '저장하고 승인하기' : '승인하기'}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl font-bold text-sm bg-gray-200 text-gray-600 hover:bg-gray-300 transition-all"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Sub Components ---

const SessionCard: React.FC<{
    session: LearningSession;
    assets: Asset[];
    onUpdateStatus: (status: LearningSessionStatus) => void;
    onDeleteSession: () => void;
    onOpenAssetDetail: (asset: Asset) => void;
}> = ({ session, assets, onUpdateStatus, onDeleteSession, onOpenAssetDetail }) => {
    return (
        <div className="bg-white rounded-[2rem] p-8 border-2 border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black text-white ${session.status === 'APPROVED' ? 'bg-primary' : session.status === 'ARCHIVED' ? 'bg-red-400' : 'bg-gray-400'}`}>
                        {session.status === 'APPROVED' ? '차시 승인됨' : session.status === 'ARCHIVED' ? '차시 반려됨' : '차시 검토대기'}
                    </span>
                    <h4 className="text-xl font-black text-navy">{session.title}</h4>
                    <span className="text-sm font-bold text-gray-400">{session.gradeGroup}</span>
                </div>
                <div className="flex gap-2">
                    {session.status !== 'APPROVED' && (
                        <button
                            onClick={() => onUpdateStatus('APPROVED')}
                            className="px-6 py-2 rounded-xl text-sm font-black bg-primary text-white hover:brightness-105 transition-all"
                        >
                            차시 일괄 승인
                        </button>
                    )}
                    {session.status !== 'ARCHIVED' ? (
                        <button
                            onClick={() => onUpdateStatus('ARCHIVED')}
                            className="px-6 py-2 rounded-xl text-sm font-black bg-red-50 text-red-500 hover:bg-red-100 transition-all border border-red-200"
                        >
                            차시 일괄 반려
                        </button>
                    ) : (
                        <button
                            onClick={onDeleteSession}
                            className="px-6 py-2 rounded-xl text-sm font-black bg-red-500 text-white hover:bg-red-600 transition-all shadow-md"
                        >
                            차시 영구 삭제
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {assets.length > 0 ? (
                    assets.map(asset => (
                        <div key={asset.assetId} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:border-primary/30 transition-all group relative">
                            <span className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[8px] font-black text-white ${asset.status === 'APPROVED' ? 'bg-primary' : 'bg-gray-400'}`}>
                                {asset.status}
                            </span>
                            <p className="text-[10px] font-black text-primary mb-1">{asset.subject}</p>
                            <h5 className="font-bold text-navy text-sm line-clamp-1 mb-2">{asset.title}</h5>
                            <button
                                onClick={() => onOpenAssetDetail(asset)}
                                className="w-full py-2 bg-white text-[10px] font-black text-gray-400 rounded-lg border border-gray-100 group-hover:bg-primary group-hover:text-white transition-all shadow-sm"
                            >
                                문항 상세보기
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="col-span-4 py-6 text-center text-xs text-gray-400 font-bold border-2 border-dashed border-gray-100 rounded-2xl">
                        소속 지문 정보를 불러올 수 없거나 모두 삭제되었습니다. (ID: {session.assetIds.join(', ')})
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReviewTab;
