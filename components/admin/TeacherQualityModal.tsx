import React, { useState } from 'react';
import { UserAccount, TeacherQualityCheck, QUALITY_CHECK_CRITERIA, QualityCheckCriterion } from '../../types';

interface TeacherQualityModalProps {
    teacher: UserAccount;
    history: TeacherQualityCheck[];
    adminName: string;
    onClose: () => void;
    onSave: (check: TeacherQualityCheck) => void;
}

const emptyScores = (): Record<QualityCheckCriterion, number> => {
    const scores = {} as Record<QualityCheckCriterion, number>;
    QUALITY_CHECK_CRITERIA.forEach(c => { scores[c] = 3; });
    return scores;
};

const TeacherQualityModal: React.FC<TeacherQualityModalProps> = ({ teacher, history, adminName, onClose, onSave }) => {
    const [scores, setScores] = useState<Record<QualityCheckCriterion, number>>(emptyScores());
    const [note, setNote] = useState('');

    const handleSave = () => {
        if (!teacher.uid) return;
        onSave({
            id: crypto.randomUUID(),
            teacherUid: teacher.uid,
            teacherName: teacher.name,
            academyId: teacher.academyId || 'UNASSIGNED',
            scores,
            note: note.trim() || undefined,
            checkedAt: new Date().toISOString(),
            checkedBy: adminName
        });
        onClose();
    };

    const average = (s: Record<QualityCheckCriterion, number>) =>
        (QUALITY_CHECK_CRITERIA.reduce((sum, c) => sum + s[c], 0) / QUALITY_CHECK_CRITERIA.length).toFixed(1);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-100 bg-navy text-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg">{teacher.name} 선생님 · 수업 품질 점검</h3>
                    <button onClick={onClose}><span className="material-symbols-outlined">close</span></button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    <div className="space-y-4">
                        {QUALITY_CHECK_CRITERIA.map(criterion => (
                            <div key={criterion}>
                                <div className="flex justify-between mb-1">
                                    <label className="text-sm font-bold text-navy">{criterion}</label>
                                    <span className="text-sm font-black text-indigo-600">{scores[criterion]}점</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    value={scores[criterion]}
                                    onChange={e => setScores({ ...scores, [criterion]: Number(e.target.value) })}
                                    className="w-full accent-indigo-600"
                                />
                            </div>
                        ))}
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">코멘트</label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="구체적인 피드백을 남겨주세요."
                            className="w-full min-h-[80px] p-3 rounded-xl border border-gray-200 text-sm"
                        />
                    </div>

                    {history.length > 0 && (
                        <div className="border-t border-gray-100 pt-4">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">이전 점검 기록</p>
                            <div className="space-y-2">
                                {history.slice(0, 5).map(h => (
                                    <div key={h.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                                        <span className="text-xs text-gray-500">{new Date(h.checkedAt).toLocaleDateString()} · {h.checkedBy}</span>
                                        <span className="text-sm font-black text-navy">{average(h.scores)}점</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex gap-2 shrink-0">
                    <button
                        onClick={handleSave}
                        className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        점검 기록 저장
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                        취소
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TeacherQualityModal;
