import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { UserAccount, ReadingLog } from '../types';
import { ReadingLogService } from '../services/api';

// 독서 기록장 — 읽은 책 + 별점 + 한줄평. 월간 리포트 "이번 달 읽은 책"의 원천.
interface ReadingLogViewProps {
    user: UserAccount;
    onBack: () => void;
}

const Stars: React.FC<{ value: number; onChange?: (v: number) => void; size?: string }> = ({ value, onChange, size = 'text-2xl' }) => (
    <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
            <button
                key={n}
                type="button"
                disabled={!onChange}
                onClick={() => onChange?.(n)}
                className={`${size} leading-none ${onChange ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'} ${n <= value ? 'text-amber-400' : 'text-gray-200'}`}
                aria-label={`${n}점`}
            >★</button>
        ))}
    </div>
);

const ReadingLogView: React.FC<ReadingLogViewProps> = ({ user, onBack }) => {
    const location = useLocation();
    const prefill = (location.state as { bookTitle?: string; author?: string } | null) || null;

    const [logs, setLogs] = useState<ReadingLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(!!prefill);

    // 입력 폼
    const [bookTitle, setBookTitle] = useState(prefill?.bookTitle || '');
    const [author, setAuthor] = useState(prefill?.author || '');
    const [finishedAt, setFinishedAt] = useState(new Date().toISOString().slice(0, 10));
    const [rating, setRating] = useState(0);
    const [review, setReview] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        if (!user.uid) return;
        setIsLoading(true);
        setLogs(await ReadingLogService.getByStudent(user.uid));
        setIsLoading(false);
    }, [user.uid]);

    useEffect(() => { load(); }, [load]);

    const resetForm = () => {
        setBookTitle(''); setAuthor(''); setReview(''); setRating(0);
        setFinishedAt(new Date().toISOString().slice(0, 10));
        setShowForm(false);
    };

    const handleSave = async () => {
        if (!user.uid || !bookTitle.trim() || rating === 0 || isSaving) return;
        setIsSaving(true);
        const log: ReadingLog = {
            id: crypto.randomUUID(),
            studentUid: user.uid,
            studentName: user.name,
            academyId: user.academyId || 'UNASSIGNED',
            bookTitle: bookTitle.trim(),
            author: author.trim() || undefined,
            finishedAt,
            rating,
            review: review.trim() || undefined,
            fromRecommendation: !!prefill,
            createdAt: new Date().toISOString(),
        };
        const ok = await ReadingLogService.create(log);
        setIsSaving(false);
        if (!ok) { alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.'); return; }
        setLogs(prev => [log, ...prev]);
        resetForm();
    };

    const handleDelete = async (log: ReadingLog) => {
        if (!confirm(`'${log.bookTitle}' 기록을 삭제할까요?`)) return;
        const ok = await ReadingLogService.delete(log.id);
        if (ok) setLogs(prev => prev.filter(l => l.id !== log.id));
    };

    const thisMonth = logs.filter(l => l.finishedAt.slice(0, 7) === new Date().toISOString().slice(0, 7));

    return (
        <div className="min-h-screen bg-background-light font-display">
            <div className="bg-navy text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">auto_stories</span>
                    <h3 className="font-bold text-lg">독서 기록장</h3>
                </div>
                <button onClick={onBack} className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-sm font-bold">
                    리포트로 돌아가기
                </button>
            </div>

            <main className="max-w-3xl mx-auto p-6 pb-24 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="text-2xl font-black text-navy">{user.name}의 책장 📚</h2>
                        <p className="text-gray-500 text-sm mt-1">이번 달 {thisMonth.length}권 · 전체 {logs.length}권</p>
                    </div>
                    {!showForm && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="bg-primary text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/30 hover:brightness-105 transition-all"
                        >
                            <span className="material-symbols-outlined">bookmark_add</span>
                            읽은 책 기록하기
                        </button>
                    )}
                </div>

                {showForm && (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-4">
                        <h3 className="font-black text-navy">읽은 책 기록하기</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-navy mb-1">책 제목 <span className="text-red-400">*</span></label>
                                <input
                                    value={bookTitle}
                                    onChange={e => setBookTitle(e.target.value)}
                                    placeholder="예: 해와 달이 된 오누이"
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-navy mb-1">지은이</label>
                                <input
                                    value={author}
                                    onChange={e => setAuthor(e.target.value)}
                                    placeholder="지은이 (선택)"
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                            <div>
                                <label className="block text-sm font-bold text-navy mb-1">다 읽은 날</label>
                                <input
                                    type="date"
                                    value={finishedAt}
                                    onChange={e => setFinishedAt(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-navy mb-1">별점 <span className="text-red-400">*</span></label>
                                <Stars value={rating} onChange={setRating} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">한줄평</label>
                            <input
                                value={review}
                                onChange={e => setReview(e.target.value)}
                                placeholder="이 책에서 가장 기억에 남는 것은?"
                                className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !bookTitle.trim() || rating === 0}
                                className="flex-1 py-3.5 bg-primary text-white rounded-xl font-bold hover:brightness-105 transition-all disabled:opacity-40"
                            >
                                {isSaving ? '저장 중...' : '책장에 꽂기'}
                            </button>
                            <button onClick={resetForm} className="px-6 py-3.5 bg-gray-100 text-gray-500 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                                취소
                            </button>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <p className="text-center text-gray-400 py-16">불러오는 중...</p>
                ) : logs.length === 0 && !showForm ? (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center">
                        <span className="material-symbols-outlined text-5xl text-gray-200 mb-4 block">shelves</span>
                        <p className="text-navy font-bold mb-1">책장이 비어 있어요</p>
                        <p className="text-gray-400 text-sm">다 읽은 책을 기록하면 매달 성장 리포트에 담겨요!</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map(log => (
                            <div key={log.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-navy">
                                        {log.bookTitle}
                                        {log.author && <span className="text-gray-400 font-medium text-sm"> · {log.author}</span>}
                                        {log.fromRecommendation && (
                                            <span className="ml-2 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded align-middle">AI 추천</span>
                                        )}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Stars value={log.rating} size="text-sm" />
                                        <span className="text-xs text-gray-400">{log.finishedAt}</span>
                                    </div>
                                    {log.review && <p className="text-sm text-gray-600 mt-2">"{log.review}"</p>}
                                </div>
                                <button
                                    onClick={() => handleDelete(log)}
                                    className="w-8 h-8 rounded-full bg-gray-50 hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors shrink-0"
                                    aria-label="삭제"
                                >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default ReadingLogView;
