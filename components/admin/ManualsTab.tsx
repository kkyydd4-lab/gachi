import React, { useState } from 'react';
import { OperationManual, ManualCategory } from '../../types';

interface ManualsTabProps {
    manuals: OperationManual[];
    onSave: (manual: OperationManual) => void;
    onDelete: (id: string) => void;
    currentAdminName: string;
}

const CATEGORIES: ManualCategory[] = ['신규 상담 대응', '학부모 불만 대응', '모집·홍보', '재등록 관리', '교사 관리', '지점 운영'];

const emptyDraft = (category: ManualCategory): OperationManual => ({
    id: crypto.randomUUID(),
    category,
    title: '',
    content: '',
    updatedAt: new Date().toISOString(),
    updatedBy: ''
});

const ManualsTab: React.FC<ManualsTabProps> = ({ manuals, onSave, onDelete, currentAdminName }) => {
    const [activeCategory, setActiveCategory] = useState<ManualCategory>(CATEGORIES[0]);
    const [draft, setDraft] = useState<OperationManual | null>(null);

    const inCategory = manuals.filter(m => m.category === activeCategory);

    const startNew = () => setDraft(emptyDraft(activeCategory));
    const startEdit = (m: OperationManual) => setDraft({ ...m });

    const handleSave = () => {
        if (!draft || !draft.title.trim()) return;
        onSave({ ...draft, updatedAt: new Date().toISOString(), updatedBy: currentAdminName });
        setDraft(null);
    };

    return (
        <div className="animate-fade-in space-y-8">
            <div>
                <h3 className="text-navy font-black text-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-500">menu_book</span>
                    운영 매뉴얼 라이브러리
                </h3>
                <p className="text-sm text-gray-400 mt-2">
                    가맹점에서 반복되는 질문을 답변이 아니라 문서로 자산화합니다. 원장님·선생님은 이 화면을 그대로 열람할 수 있습니다.
                </p>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => { setActiveCategory(cat); setDraft(null); }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
                    >
                        {cat}
                        <span className="ml-2 text-xs opacity-70">{manuals.filter(m => m.category === cat).length}</span>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 목록 */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <h4 className="font-bold text-navy">{activeCategory} 문서</h4>
                        <button
                            onClick={startNew}
                            className="text-sm font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-lg">add_circle</span>
                            새 문서
                        </button>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
                        {inCategory.map(m => (
                            <button
                                key={m.id}
                                onClick={() => startEdit(m)}
                                className={`w-full text-left p-5 hover:bg-gray-50 transition-colors ${draft?.id === m.id ? 'bg-indigo-50/50' : ''}`}
                            >
                                <p className="font-bold text-navy">{m.title}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    {m.updatedBy ? `${m.updatedBy} · ` : ''}{new Date(m.updatedAt).toLocaleDateString()} 수정
                                </p>
                            </button>
                        ))}
                        {inCategory.length === 0 && (
                            <p className="p-10 text-center text-gray-400 text-sm">이 카테고리에 등록된 문서가 없습니다.</p>
                        )}
                    </div>
                </div>

                {/* 편집 영역 */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6">
                    {!draft ? (
                        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-gray-300 gap-3">
                            <span className="material-symbols-outlined text-4xl">description</span>
                            <p className="text-sm font-medium">왼쪽에서 문서를 선택하거나 새 문서를 만드세요.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">카테고리</label>
                                <select
                                    value={draft.category}
                                    onChange={e => setDraft({ ...draft, category: e.target.value as ManualCategory })}
                                    className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">제목</label>
                                <input
                                    value={draft.title}
                                    onChange={e => setDraft({ ...draft, title: e.target.value })}
                                    placeholder="예: 재등록 상담 스크립트"
                                    className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">내용</label>
                                <textarea
                                    value={draft.content}
                                    onChange={e => setDraft({ ...draft, content: e.target.value })}
                                    placeholder="상황별 대응 내용을 적어주세요."
                                    className="w-full min-h-[260px] p-3 rounded-xl border border-gray-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <div>
                                    {manuals.some(m => m.id === draft.id) && (
                                        <button
                                            onClick={() => { onDelete(draft.id); setDraft(null); }}
                                            className="text-sm font-bold text-red-400 hover:text-red-500"
                                        >
                                            삭제
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setDraft(null)}
                                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={!draft.title.trim()}
                                        className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shadow-lg shadow-indigo-200"
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManualsTab;
