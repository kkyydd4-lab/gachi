// Firebase 초기화 파일
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Firebase 설정
// User Provided Config
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
export const analytics = getAnalytics(app);

// Firebase 서비스 인스턴스
export const auth = getAuth(app);
export const db = getFirestore(app);

// 개발 환경에서 에뮬레이터 사용 (선택사항)
// 에뮬레이터를 사용하려면 아래 주석을 해제하세요
// if (import.meta.env.DEV) {
//   connectAuthEmulator(auth, "http://localhost:9099");
//   connectFirestoreEmulator(db, "localhost", 8080);
// }

export default app;
