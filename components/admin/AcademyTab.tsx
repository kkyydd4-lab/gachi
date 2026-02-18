import React from 'react';
import { Academy } from '../../types';

interface AcademyTabProps {
    academies: Academy[];
    newAcademyName: string;
    setNewAcademyName: (name: string) => void;
    newAcademyRegion: string;
    setNewAcademyRegion: (region: string) => void;
    handleCreateAcademy: () => void;
}

const AcademyTab: React.FC<AcademyTabProps> = ({
    academies,
    newAcademyName,
    setNewAcademyName,
    newAcademyRegion,
    setNewAcademyRegion,
    handleCreateAcademy
}) => {
    return (
        <div className="animate-fade-in space-y-8">
            <h3 className="text-navy font-black text-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-500">domain</span>
                학원 등록 및 관리
            </h3>

            {/* 학원 등록 폼 */}
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 flex items-end gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-bold text-navy mb-2">학원명</label>
                    <input
                        type="text"
                        value={newAcademyName}
                        onChange={(e) => setNewAcademyName(e.target.value)}
                        placeholder="예: 가치인 대치점"
                        className="w-full p-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-bold text-navy mb-2">지역</label>
                    <input
                        type="text"
                        value={newAcademyRegion}
                        onChange={(e) => setNewAcademyRegion(e.target.value)}
                        placeholder="예: 서울 강남구"
                        className="w-full p-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>
                <button
                    onClick={handleCreateAcademy}
                    className="bg-indigo-600 text-white font-bold py-4 px-8 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                    + 신규 등록
                </button>
            </div>

            {/* 학원 목록 */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">학원명</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">지역</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">고유 코드</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">생성일</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {academies.map((academy) => (
                            <tr key={academy.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-6 font-bold text-navy">{academy.name}</td>
                                <td className="p-6 text-sm text-gray-600">{academy.region}</td>
                                <td className="p-6">
                                    <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-mono font-bold text-sm">
                                        {academy.code}
                                    </span>
                                </td>
                                <td className="p-6 text-sm text-gray-400">
                                    {new Date(academy.createdAt).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {academies.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-10 text-center text-gray-400 font-medium">
                                    등록된 학원이 없습니다.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AcademyTab;
