import { create } from 'zustand';
import { UserAccount } from '@/types';
import { AuthService } from '@/services/api';

interface AuthState {
    user: UserAccount | null;
    isLoading: boolean;
    login: (user: UserAccount) => void;
    logout: () => void;
    updateUser: (user: UserAccount) => void;
    initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    login: (user) => {
        set({ user });
        localStorage.setItem('literacy_session', JSON.stringify(user));
    },
    logout: () => {
        // Firebase Auth 세션도 함께 종료 (이전에는 로컬 상태만 지워 재로그인 시 이전 세션이 남아있는 문제가 있었음)
        AuthService.logout().catch((e) => console.error('Firebase logout error:', e));
        set({ user: null });
        localStorage.removeItem('literacy_session');
    },
    updateUser: (user) => {
        set({ user });
        localStorage.setItem('literacy_session', JSON.stringify(user));
    },
    initAuth: async () => {
        const savedSession = localStorage.getItem('literacy_session');
        if (savedSession) {
            try {
                let user = JSON.parse(savedSession);
                set({ user });

                // Firebase 인증 상태 확인 및 최신 데이터 동기화
                AuthService.onAuthStateChanged(async (firebaseUser) => {
                    if (firebaseUser) {
                        const latestUser = await AuthService.getUserByUid(firebaseUser.uid);
                        if (latestUser) {
                            set({ user: latestUser });
                            localStorage.setItem('literacy_session', JSON.stringify(latestUser));
                        }
                    }
                });
            } catch (e) {
                console.error("Session parse error", e);
                localStorage.removeItem('literacy_session');
            }
        }
        set({ isLoading: false });
    },
}));
