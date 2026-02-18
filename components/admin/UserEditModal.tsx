import React, { useState } from 'react';
import { UserAccount, Academy } from '../../types';

interface UserEditModalProps {
    user: UserAccount;
    academies: Academy[];
    onClose: () => void;
    onSave: (user: UserAccount) => void;
}

const UserEditModal: React.FC<UserEditModalProps> = ({
    user,
    academies,
    onClose,
    onSave
}) => {
    const [editedUser, setEditedUser] = useState<UserAccount>({ ...user });

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
                <div className="p-6 border-b border-gray-100 bg-navy text-white flex justify-between items-center">
                    <h3 className="font-bold text-lg">사용자 정보 수정</h3>
                    <button onClick={onClose}><span className="material-symbols-outlined">close</span></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">이름</label>
                        <input
                            type="text"
                            value={editedUser.name}
                            onChange={e => setEditedUser({ ...editedUser, name: e.target.value })}
                            className="w-full p-3 rounded-xl border border-gray-200"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">학교</label>
                        <input
                            type="text"
                            value={editedUser.school}
                            onChange={e => setEditedUser({ ...editedUser, school: e.target.value })}
                            className="w-full p-3 rounded-xl border border-gray-200"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">학년/직급</label>
                        <input
                            type="text"
                            value={editedUser.grade}
                            onChange={e => setEditedUser({ ...editedUser, grade: e.target.value })}
                            className="w-full p-3 rounded-xl border border-gray-200"
                        />
                    </div>
                    {/* 아카데미 선택 (선생님/학생 공통) */}
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">소속 학원</label>
                        <select
                            value={editedUser.academyId || ''}
                            onChange={e => setEditedUser({ ...editedUser, academyId: e.target.value })}
                            className="w-full p-3 rounded-xl border border-gray-200"
                        >
                            <option value="">소속 없음</option>
                            {academies.map(a => (
                                <option key={a.id} value={a.id}>{a.name} ({a.region})</option>
                            ))}
                        </select>
                    </div>
                    {editedUser.role === 'TEACHER' && (
                        <div className="flex items-center gap-2 mt-4">
                            <input
                                type="checkbox"
                                id="isAcademyAdmin"
                                checked={editedUser.isAcademyAdmin || false}
                                onChange={e => setEditedUser({ ...editedUser, isAcademyAdmin: e.target.checked })}
                                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor="isAcademyAdmin" className="text-sm font-bold text-navy">학원 원장님 권한 부여</label>
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-gray-100 flex gap-2">
                    <button
                        onClick={() => onSave(editedUser)}
                        className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        저장하기
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

export default UserEditModal;
