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
                        const users = await AuthService.getAllUsers();
                        const latestUser = users.find(u => u.uid === firebaseUser.uid);
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
