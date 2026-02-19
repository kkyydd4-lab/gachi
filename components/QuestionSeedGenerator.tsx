/**
 * QuestionSeedGenerator - 문제 생성 데이터 관리자 (Legacy Adapter)
 * 
 * [Refactoring Note]
 * 이 컴포넌트는 초기 데이터(INITIAL_CURRICULUM_DATA)를 DB에 주입하는 역할을 합니다.
 * 이제 데이터는 `data/curriculum.ts`에서 중앙 관리되므로, 여기서는 해당 파일을 import하여 사용합니다.
 */

import React, { useState } from 'react';
import { CurriculumService } from '../services/api';
import { INITIAL_CURRICULUM_DATA, SENTENCE_LENGTH_GUIDE } from '../data/curriculum';
import { GradeGroupType } from '../types/domain';

const QuestionSeedGenerator: React.FC = () => {
    const [selectedGrade, setSelectedGrade] = useState<GradeGroupType>('초등 저학년');
    const [isMigrating, setIsMigrating] = useState(false);
    const [status, setStatus] = useState<string>('');

    const handleMigration = async () => {
        if (!confirm('초기 데이터를 DB에 업로드하시겠습니까? (이미 존재하면 덮어씁니다)')) return;

        setIsMigrating(true);
        setStatus('데이터 업로드 중...');

        try {
            // 모든 학년의 데이터를 순차적으로 업로드
            for (const grade of Object.keys(INITIAL_CURRICULUM_DATA) as GradeGroupType[]) {
                setStatus(`${grade} 설정 저장 중...`);
                await CurriculumService.saveConfig(INITIAL_CURRICULUM_DATA[grade]);
            }
            setStatus('모든 데이터 마이그레이션이 완료되었습니다!');
            alert('초기 데이터 설정이 완료되었습니다.');
        } catch (e) {
            console.error(e);
            setStatus('오류가 발생했습니다.');
            alert('오류 발생: ' + e);
        } finally {
            setIsMigrating(false);
        }
    };

    const currentData = INITIAL_CURRICULUM_DATA[selectedGrade];
    const sentenceGuide = SENTENCE_LENGTH_GUIDE[selectedGrade];

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
                <h2 className="text-xl font-black text-navy mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">database</span>
                    초기 데이터 관리 (Admin Only)
                </h2>

                <p className="text-gray-500 text-sm mb-6">
                    시스템 초기 설정을 위한 커리큘럼 데이터를 Firestore에 업로드하거나 확인합니다.<br />
                    이 도구는 개발자 및 관리자 전용입니다.
                </p>

                <div className="flex gap-3 mb-6">
                    {(Object.keys(INITIAL_CURRICULUM_DATA) as GradeGroupType[]).map(grade => (
                        <button
                            key={grade}
                            onClick={() => setSelectedGrade(grade)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${selectedGrade === grade
                                    ? 'bg-navy text-white border-navy'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            {grade}
                        </button>
                    ))}
                </div>

                {/* 데이터 미리보기 */}
                <div className="bg-gray-50 rounded-xl p-6 mb-6 font-mono text-xs text-gray-600 h-96 overflow-y-auto custom-scrollbar">
                    <h3 className="font-bold text-navy mb-2 text-sm border-b pb-2 border-gray-200">
                        {selectedGrade} 구성 데이터 미리보기
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <p className="font-bold text-primary mb-1">📋 기본 설정</p>
                            <ul className="list-disc list-inside space-y-1 mb-4">
                                <li>글자 수: {currentData.config.charCount}</li>
                                <li>문체: {currentData.config.style}</li>
                                <li>평균 문장 길이: {sentenceGuide.avg}</li>
                            </ul>

                            <p className="font-bold text-primary mb-1">📊 카테고리별 문항 수</p>
                            <UserFriendlyJson data={currentData.categories} />
                        </div>
                        <div>
                            <p className="font-bold text-primary mb-1">📚 포함된 주제 ({currentData.topics.length}개)</p>
                            <div className="flex flex-wrap gap-1">
                                {currentData.topics.map(t => (
                                    <span key={t} className="bg-white border border-gray-200 px-2 py-1 rounded text-gray-500">
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-yellow-600">warning</span>
                        <p className="text-sm font-bold text-yellow-700">
                            초기화 시 기존 설정이 덮어씌워질 수 있습니다.
                        </p>
                    </div>
                    <button
                        onClick={handleMigration}
                        disabled={isMigrating}
                        className={`px-6 py-3 rounded-xl font-black text-white shadow-lg transition-all ${isMigrating
                                ? 'bg-gray-300 cursor-wait'
                                : 'bg-red-500 hover:bg-red-600 shadow-red-200'
                            }`}
                    >
                        {isMigrating ? status : '데이터 업로드 / 초기화'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Simple helper to display JSON-like object cleanly
const UserFriendlyJson = ({ data }: { data: any }) => (
    <div className="space-y-1">
        {Object.entries(data).map(([key, val]) => (
            <div key={key} className="flex justify-between border-b border-gray-200 border-dashed pb-1 last:border-0">
                <span>{key}</span>
                <span className="font-bold">{String(val)}</span>
            </div>
        ))}
    </div>
);

export default QuestionSeedGenerator;
