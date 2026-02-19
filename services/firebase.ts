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
    await getDoc(doc(db, '_health_check', 'ping'));
    return true;
  } catch (error: any) {
    // permission-denied는 연결은 성공했지만 권한이 없는 경우 (= 연결 OK)
    if (error?.code === 'permission-denied') {
      return true;
    }
    console.error('[Firebase] 연결 확인 실패:', error);
    return false;
  }
};

export default app;
