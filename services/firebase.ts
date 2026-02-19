// Firebase 초기화 파일
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAnalytics, Analytics } from "firebase/analytics";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyCvY9CZyCQ7_xPALJRwncoSYWAuK2rVkNw",
  authDomain: "gachiic.firebaseapp.com",
  projectId: "gachiic",
  storageBucket: "gachiic.firebasestorage.app",
  messagingSenderId: "315672493685",
  appId: "1:315672493685:web:0b21598b548549a6f1823c",
  measurementId: "G-LLVGD5VM8R"
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Analytics 초기화 (광고 차단기 등으로 실패할 수 있으므로 방어적 처리)
let analytics: Analytics | null = null;
try {
  if (typeof window !== 'undefined') {
    analytics = getAnalytics(app);
  }
} catch (e) {
  console.warn('[Firebase] Analytics 초기화 실패 (광고 차단기 등):', e);
}
export { analytics };

// Firebase 서비스 인스턴스
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Firebase 연결 상태 확인 헬퍼
 * - Firestore에 간단한 읽기를 시도하여 연결 상태를 확인
 */
export const checkFirebaseConnection = async (): Promise<boolean> => {
  try {
    // 실제 사용 중인 컬렉션에서 읽기 시도
    const { getDocs, collection, query, limit } = await import('firebase/firestore');
    const q = query(collection(db, 'users'), limit(1));
    await getDocs(q);
    return true;
  } catch (error: any) {
    const code = error?.code || '';
    // 서버에서 응답이 온 에러들 = 연결 자체는 성공
    if (code === 'permission-denied' || code === 'unauthenticated' ||
      code === 'not-found' || code.includes('PERMISSION')) {
      return true;
    }
    console.error('[Firebase] 연결 확인 실패:', error);
    return false;
  }
};

export default app;
