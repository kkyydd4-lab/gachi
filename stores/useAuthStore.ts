import { create } from 'zustand';
import { UserAccount } from '@/types';
import { AuthService } from '@/services/api';

const SESSION_KEY = 'literacy_session';

interface AuthState {
    user: UserAccount | null;
    isLoading: boolean;
    login: (user: UserAccount) => void;
    logout: () => void;
    updateUser: (user: UserAccount) => void;
    initAuth: () => Promise<void>;
}

// onAuthStateChanged 구독 해제 함수. React StrictMode(개발)에서 effect가 두 번 실행되어
// 리스너가 중첩되는 것을 막기 위해 모듈 스코프에 보관한다.
let unsubscribeAuth: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,
    login: (user) => {
        set({ user });
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    },
    logout: () => {
        // Firebase Auth 세션 종료 → onAuthStateChanged(null)이 뒤따라 상태를 정리한다.
        // 여기서도 즉시 지워 로그아웃 반응이 지연되지 않게 한다.
        AuthService.logout().catch((e) => console.error('Firebase logout error:', e));
        set({ user: null });
        localStorage.removeItem(SESSION_KEY);
    },
    updateUser: (user) => {
        set({ user });
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    },
    initAuth: async () => {
        if (unsubscribeAuth) return; // 이미 구독 중

        // localStorage는 "첫 화면 깜빡임 방지용 캐시"일 뿐이며, 진짜 로그인 여부는
        // 항상 Firebase Auth가 결정한다. (이전에는 캐시가 있으면 로그인 상태로 간주해서,
        // 토큰이 만료돼도 화면은 로그인 상태로 남고 모든 Firestore 쓰기가 조용히 실패했다.)
        const cached = localStorage.getItem(SESSION_KEY);
        if (cached) {
            try {
                set({ user: JSON.parse(cached) as UserAccount });
            } catch {
                localStorage.removeItem(SESSION_KEY);
            }
        }

        // 저장된 세션이 없어도 반드시 구독한다 — Firebase 세션만 살아있는 경우도 복구해야 한다.
        unsubscribeAuth = AuthService.onAuthStateChanged(async (firebaseUser) => {
            if (!firebaseUser) {
                // 로그아웃 또는 토큰 만료 → 화면도 확실히 로그아웃 상태로 되돌린다.
                set({ user: null, isLoading: false });
                localStorage.removeItem(SESSION_KEY);
                return;
            }

            try {
                const latestUser = await AuthService.getUserByUid(firebaseUser.uid);
                if (latestUser) {
                    set({ user: latestUser, isLoading: false });
                    localStorage.setItem(SESSION_KEY, JSON.stringify(latestUser));
                } else {
                    // Auth 계정은 있는데 프로필 문서가 없는 상태(가입 중단 등).
                    // 그대로 두면 권한 오류만 반복되므로 세션을 정리한다.
                    console.warn('[Auth] 프로필 문서가 없어 세션을 종료합니다:', firebaseUser.uid);
                    await AuthService.logout().catch(() => { });
                    set({ user: null, isLoading: false });
                    localStorage.removeItem(SESSION_KEY);
                }
            } catch (e) {
                console.error('[Auth] 프로필 동기화 실패:', e);
                set({ isLoading: false });
            }
        });
    },
}));
