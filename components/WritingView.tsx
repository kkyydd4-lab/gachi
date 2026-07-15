import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserAccount, Writing, WritingGenre, WRITING_GENRES, WRITING_RUBRIC_CRITERIA, GradeGroupType } from '../types';
import { WritingService } from '../services/api';
import { generateWritingReview, transcribeHandwriting, uploadWritingImages } from '../services/writingReview';
import { compressImage, CompressedImage } from '../utils/imageCompress';

const MAX_PHOTOS = 5;

// 학생 글쓰기 노트 — 제출 → AI 루브릭 분석 → 교사 확인 결과 열람
interface WritingViewProps {
    user: UserAccount;
    onBack: () => void;
}

const determineGradeGroup = (gradeStr: string): GradeGroupType => {
    if (gradeStr.includes('초등 1') || gradeStr.includes('초등 2')) return '초등 저학년';
    if (gradeStr.includes('초등 3') || gradeStr.includes('초등 4')) return '초등 중학년';
    if (gradeStr.includes('초등 5') || gradeStr.includes('초등 6')) return '초등 고학년';
    return '중등';
};

const STATUS_LABEL: Record<Writing['status'], { text: string; cls: string }> = {
    SUBMITTED: { text: 'AI 분석 대기', cls: 'bg-amber-50 text-amber-600' },
    AI_REVIEWED: { text: '선생님 확인 중', cls: 'bg-indigo-50 text-indigo-600' },
    TEACHER_CONFIRMED: { text: '피드백 완료', cls: 'bg-primary/10 text-primary' },
};

const WritingView: React.FC<WritingViewProps> = ({ user, onBack }) => {
    const [writings, setWritings] = useState<Writing[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [mode, setMode] = useState<'list' | 'compose' | 'detail'>('list');
    const [selected, setSelected] = useState<Writing | null>(null);

    // 작성 폼
    const [title, setTitle] = useState('');
    const [genre, setGenre] = useState<WritingGenre>(WRITING_GENRES[0]);
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);

    // 손글씨 사진 입력
    const [inputMode, setInputMode] = useState<'type' | 'photo'>('type');
    const [photos, setPhotos] = useState<CompressedImage[]>([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [photoError, setPhotoError] = useState('');
    const [ocrModel, setOcrModel] = useState<string | null>(null);
    const [transcribeProgress, setTranscribeProgress] = useState<{ done: number; total: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = ''; // 같은 파일 재선택 허용
        if (files.length === 0) return;
        setPhotoError('');
        if (photos.length + files.length > MAX_PHOTOS) {
            setPhotoError(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);
            return;
        }
        try {
            const compressed = await Promise.all(files.map(compressImage));
            setPhotos(prev => [...prev, ...compressed]);
        } catch (err) {
            console.error('Image compress failed:', err);
            setPhotoError('사진을 불러오지 못했어요. 다른 사진으로 시도해주세요.');
        }
    };

    // 사진 순서 변경 (판독은 사진 순서대로 이어붙이므로 순서가 중요)
    const movePhoto = (from: number, to: number) => {
        if (to < 0 || to >= photos.length) return;
        setPhotos(prev => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const handleTranscribe = async () => {
        if (photos.length === 0 || isTranscribing) return;
        setIsTranscribing(true);
        setPhotoError('');
        setTranscribeProgress({ done: 0, total: photos.length });
        try {
            const { text, servedModel } = await transcribeHandwriting(
                photos.map(p => ({ data: p.base64, mediaType: p.mediaType })),
                (done, total) => setTranscribeProgress({ done, total })
            );
            if (!text) throw new Error('empty');
            setContent(text);
            if (servedModel) setOcrModel(servedModel); // 실제 판독한 모델 표시 (진단용)
        } catch (err) {
            console.error('Transcription failed:', err);
            setPhotoError('글자를 읽어오지 못했어요. 사진이 선명한지 확인하고 다시 시도해주세요.');
        } finally {
            setIsTranscribing(false);
            setTranscribeProgress(null);
        }
    };

    const load = useCallback(async () => {
        if (!user.uid) return;
        setIsLoading(true);
        const list = await WritingService.getByStudent(user.uid);
        setWritings(list);
        setIsLoading(false);
    }, [user.uid]);

    useEffect(() => { load(); }, [load]);

    // AI 분석 실행 (제출 직후 자동 + 실패 시 상세 화면에서 재시도)
    const runAnalysis = async (writing: Writing) => {
        setAnalyzingId(writing.id);
        try {
            const review = await generateWritingReview(writing);
            await WritingService.attachAiReview(writing.id, review);
            const updated = { ...writing, aiReview: review, status: 'AI_REVIEWED' as const };
            setWritings(prev => prev.map(w => (w.id === writing.id ? updated : w)));
            setSelected(prev => (prev?.id === writing.id ? updated : prev));
        } catch (e) {
            console.error('AI writing review failed:', e);
        } finally {
            setAnalyzingId(null);
        }
    };

    const handleSubmit = async () => {
        if (!user.uid || !title.trim() || content.trim().length < 30 || isSubmitting) return;
        setIsSubmitting(true);

        const writingId = crypto.randomUUID();

        // 손글씨 원본 사진 업로드 (실패해도 텍스트 제출은 진행)
        let imageUrls: string[] | undefined;
        if (photos.length > 0) {
            try {
                imageUrls = await uploadWritingImages(user.uid, writingId, photos);
            } catch (err) {
                console.error('Image upload failed:', err);
                imageUrls = undefined;
            }
        }

        const writing: Writing = {
            id: writingId,
            studentUid: user.uid,
            studentName: user.name,
            academyId: user.academyId || 'UNASSIGNED',
            gradeGroup: determineGradeGroup(user.grade || ''),
            title: title.trim(),
            content: content.trim(),
            genre,
            submittedAt: new Date().toISOString(),
            status: 'SUBMITTED',
            ...(imageUrls && imageUrls.length > 0 ? { imageUrls } : {}),
        };

        const ok = await WritingService.create(writing);
        setIsSubmitting(false);
        if (!ok) {
            alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        setWritings(prev => [writing, ...prev]);
        setTitle(''); setContent(''); setGenre(WRITING_GENRES[0]);
        setPhotos([]); setInputMode('type'); setPhotoError('');
        setSelected(writing);
        setMode('detail');
        runAnalysis(writing); // 백그라운드 분석 — 실패해도 재시도 버튼으로 복구 가능
    };

    const avgScore = (w: Writing) => {
        if (!w.aiReview?.rubric?.length) return null;
        return (w.aiReview.rubric.reduce((s, r) => s + r.score, 0) / w.aiReview.rubric.length).toFixed(1);
    };

    return (
        <div className="min-h-screen bg-background-light font-display">
            <div className="bg-navy text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">edit_note</span>
                    <h3 className="font-bold text-lg">글쓰기 노트</h3>
                </div>
                <button
                    onClick={() => (mode === 'list' ? onBack() : setMode('list'))}
                    className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-sm font-bold"
                >
                    {mode === 'list' ? '리포트로 돌아가기' : '목록으로'}
                </button>
            </div>

            <main className="max-w-3xl mx-auto p-6 pb-24">
                {mode === 'list' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <h2 className="text-2xl font-black text-navy">{user.name}의 글 모음 ✍️</h2>
                                <p className="text-gray-500 text-sm mt-1">쓴 글이 쌓일수록 성장이 보여요. 지금까지 {writings.length}편!</p>
                            </div>
                            <button
                                onClick={() => setMode('compose')}
                                className="bg-primary text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/30 hover:brightness-105 transition-all"
                            >
                                <span className="material-symbols-outlined">stylus</span>
                                새 글 쓰기
                            </button>
                        </div>

                        {isLoading ? (
                            <p className="text-center text-gray-400 py-16">불러오는 중...</p>
                        ) : writings.length === 0 ? (
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center">
                                <span className="material-symbols-outlined text-5xl text-gray-200 mb-4 block">history_edu</span>
                                <p className="text-navy font-bold mb-1">아직 쓴 글이 없어요</p>
                                <p className="text-gray-400 text-sm">첫 글을 쓰면 AI 선생님이 바로 읽고 피드백을 줘요!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {writings.map(w => (
                                    <button
                                        key={w.id}
                                        onClick={() => { setSelected(w); setMode('detail'); }}
                                        className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div className="min-w-0">
                                                <p className="font-bold text-navy truncate">{w.title}</p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {w.genre} · {new Date(w.submittedAt).toLocaleDateString()} · {w.content.length}자
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {avgScore(w) && (
                                                    <span className="text-sm font-black text-indigo-600">{avgScore(w)}점</span>
                                                )}
                                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_LABEL[w.status].cls}`}>
                                                    {STATUS_LABEL[w.status].text}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {mode === 'compose' && (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-5">
                        <h2 className="text-xl font-black text-navy">새 글 쓰기</h2>
                        <div>
                            <label className="block text-sm font-bold text-navy mb-2">글의 종류</label>
                            <div className="flex gap-2 flex-wrap">
                                {WRITING_GENRES.map(g => (
                                    <button
                                        key={g}
                                        onClick={() => setGenre(g)}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${genre === g ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-navy mb-2">제목</label>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="글의 제목을 지어주세요"
                                className="w-full p-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-navy mb-2">글 입력 방법</label>
                            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl mb-4">
                                <button
                                    onClick={() => setInputMode('type')}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${inputMode === 'type' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">keyboard</span>
                                    직접 입력
                                </button>
                                <button
                                    onClick={() => setInputMode('photo')}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${inputMode === 'photo' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">photo_camera</span>
                                    손글씨 사진 ({photos.length}/{MAX_PHOTOS})
                                </button>
                            </div>

                            {inputMode === 'photo' && (
                                <div className="mb-4 bg-gray-50 rounded-2xl p-5 space-y-4">
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        공책에 쓴 글을 <b className="text-navy">순서대로</b> 찍어 올려주세요 (최대 {MAX_PHOTOS}장).
                                        순서가 뒤바뀌면 <b className="text-navy">화살표로 바꿀 수 있어요.</b> AI가 글자를 읽어오면 아래에서 확인하고 고칠 수 있어요.
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handlePhotoPick}
                                        className="hidden"
                                    />
                                    <div className="flex flex-wrap gap-3">
                                        {photos.map((p, i) => (
                                            <div key={i} className="relative w-24 h-28">
                                                <div className="relative w-24 h-24">
                                                    <img src={p.dataUrl} alt={`사진 ${i + 1}`} className="w-full h-full object-cover rounded-xl border border-gray-200" />
                                                    <span className="absolute top-1 left-1 bg-navy/80 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{i + 1}</span>
                                                    <button
                                                        onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-400 text-white rounded-full flex items-center justify-center shadow hover:bg-red-500"
                                                        aria-label="사진 삭제"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </div>
                                                {/* 순서 변경 화살표 */}
                                                <div className="flex justify-center gap-1 mt-1">
                                                    <button
                                                        onClick={() => movePhoto(i, i - 1)}
                                                        disabled={i === 0}
                                                        className="w-8 h-6 rounded-md bg-white border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                                        aria-label="앞으로"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                                                    </button>
                                                    <button
                                                        onClick={() => movePhoto(i, i + 1)}
                                                        disabled={i === photos.length - 1}
                                                        className="w-8 h-6 rounded-md bg-white border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                                        aria-label="뒤로"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {photos.length < MAX_PHOTOS && (
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary transition-colors flex flex-col items-center justify-center gap-1"
                                            >
                                                <span className="material-symbols-outlined">add_a_photo</span>
                                                <span className="text-[10px] font-bold">사진 추가</span>
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleTranscribe}
                                        disabled={photos.length === 0 || isTranscribing}
                                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                                    >
                                        {isTranscribing && <span className="material-symbols-outlined animate-spin text-sm">refresh</span>}
                                        {isTranscribing
                                            ? (transcribeProgress && transcribeProgress.total > 1
                                                ? `AI가 글자를 읽고 있어요... (${transcribeProgress.done}/${transcribeProgress.total}장)`
                                                : 'AI가 글자를 읽고 있어요...')
                                            : content ? '사진에서 다시 읽어오기' : '사진에서 글 읽어오기'}
                                    </button>
                                    {photoError && <p className="text-sm text-red-500 font-bold">{photoError}</p>}
                                    {ocrModel && !photoError && (
                                        <p className="text-[10px] text-gray-400 text-center">판독 모델: {ocrModel}</p>
                                    )}
                                </div>
                            )}

                            <label className="block text-sm font-bold text-navy mb-2">
                                본문 <span className="text-gray-400 font-medium">({content.trim().length}자 · 최소 30자)</span>
                                {inputMode === 'photo' && content && (
                                    <span className="ml-2 text-xs text-indigo-500 font-bold">AI가 읽어온 글이에요 — 틀린 글자가 있으면 고쳐주세요!</span>
                                )}
                            </label>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder={inputMode === 'photo' ? '사진에서 글을 읽어오면 여기에 나타나요.' : '자유롭게 써보세요. 다 쓰면 AI 선생님이 읽고 피드백을 줘요.'}
                                className="w-full min-h-[320px] p-4 rounded-xl border border-gray-200 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !title.trim() || content.trim().length < 30}
                            className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg hover:brightness-105 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {isSubmitting && <span className="material-symbols-outlined animate-spin text-sm">refresh</span>}
                            {isSubmitting ? '제출 중...' : '제출하고 AI 피드백 받기'}
                        </button>
                    </div>
                )}

                {mode === 'detail' && selected && (
                    <div className="space-y-6">
                        {/* 글 본문 */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                                <h2 className="text-xl font-black text-navy">{selected.title}</h2>
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_LABEL[selected.status].cls}`}>
                                    {STATUS_LABEL[selected.status].text}
                                </span>
                            </div>
                            <p className="text-xs text-gray-400 mb-5">{selected.genre} · {new Date(selected.submittedAt).toLocaleString()}</p>
                            {selected.imageUrls && selected.imageUrls.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-5">
                                    {selected.imageUrls.map((url, i) => (
                                        <a key={i} href={url} target="_blank" rel="noreferrer" className="block w-20 h-20">
                                            <img src={url} alt={`손글씨 원본 ${i + 1}`} className="w-full h-full object-cover rounded-xl border border-gray-200 hover:opacity-80 transition-opacity" />
                                        </a>
                                    ))}
                                </div>
                            )}
                            <p className="text-navy leading-relaxed whitespace-pre-wrap">{selected.content}</p>
                        </div>

                        {/* AI 피드백 */}
                        {selected.aiReview ? (
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-6">
                                <h3 className="font-black text-navy flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-500">smart_toy</span>
                                    AI 선생님 피드백
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {WRITING_RUBRIC_CRITERIA.map(c => {
                                        const item = selected.aiReview!.rubric.find(r => r.criterion === c);
                                        return (
                                            <div key={c} className="bg-indigo-50/50 rounded-2xl p-4 text-center">
                                                <p className="text-[11px] text-gray-400 font-bold mb-1">{c}</p>
                                                <p className="text-2xl font-black text-indigo-600">{item?.score ?? '-'}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="bg-gray-50 rounded-2xl p-5">
                                    <p className="text-navy leading-relaxed">{selected.aiReview.overall}</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5">
                                        <p className="text-xs font-black text-primary mb-2">🌟 잘한 점</p>
                                        <p className="text-sm text-navy leading-relaxed">{selected.aiReview.strengths}</p>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                                        <p className="text-xs font-black text-amber-600 mb-2">💡 다음에 시도해볼 것</p>
                                        <p className="text-sm text-navy leading-relaxed">{selected.aiReview.improvements}</p>
                                    </div>
                                </div>
                                {selected.aiReview.rubric.some(r => r.comment) && (
                                    <details className="text-sm">
                                        <summary className="cursor-pointer font-bold text-gray-400 hover:text-navy">기준별 자세한 피드백 보기</summary>
                                        <div className="mt-3 space-y-2">
                                            {selected.aiReview.rubric.map(r => (
                                                <div key={r.criterion} className="bg-gray-50 rounded-xl p-4">
                                                    <p className="font-bold text-navy text-xs mb-1">{r.criterion} — {r.score}점</p>
                                                    <p className="text-gray-600">{r.comment}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
                                {analyzingId === selected.id ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-3xl text-indigo-400 mb-3 block">refresh</span>
                                        <p className="font-bold text-navy">AI 선생님이 글을 읽고 있어요...</p>
                                        <p className="text-gray-400 text-sm mt-1">잠시만 기다려주세요 (약 10~20초)</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-bold text-navy mb-1">AI 분석이 아직 완료되지 않았어요</p>
                                        <p className="text-gray-400 text-sm mb-4">네트워크 문제로 실패했을 수 있어요. 다시 시도해보세요.</p>
                                        <button
                                            onClick={() => runAnalysis(selected)}
                                            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
                                        >
                                            AI 분석 다시 시도
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* 교사 코멘트 */}
                        {selected.teacherComment && (
                            <div className="bg-secondary/5 border border-secondary/15 rounded-3xl p-8">
                                <h3 className="font-black text-navy flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-secondary">school</span>
                                    {selected.confirmedBy || '선생님'} 선생님의 한마디
                                </h3>
                                <p className="text-navy leading-relaxed">{selected.teacherComment}</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default WritingView;
