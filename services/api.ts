// Firebase 기반 API 서비스
import { UserAccount, Asset, AdminConfig, GradeGroupType, TestSession, PostTestSurvey, Academy, GradeCurriculumConfig, LearningSession, LearningSessionStatus } from '../types';
import { auth, db } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';

// --- 컬렉션 참조 ---
const USERS_COLLECTION = 'users';
const ASSETS_COLLECTION = 'assets';
const CONFIG_COLLECTION = 'config';
const CONFIG_DOC_ID = 'main';
const CURRICULUM_COLLECTION = 'curriculum_configs';
const SESSIONS_COLLECTION = 'test_sessions';
const ACADEMIES_COLLECTION = 'academies';
const LEARNING_SESSIONS_COLLECTION = 'learning_sessions';

// --- 헬퍼 함수 ---
// 이메일 형식으로 변환 (Firebase Auth는 이메일 형식 필요)
const toEmail = (userId: string): string => {
  if (userId.includes('@')) return userId;
  return `${userId}@gachi.in`;
};

// --- Auth Service (회원 관리) ---
export const AuthService = {
  // 현재 로그인된 사용자 가져오기
  getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
  },

  // 인증 상태 변경 감지
  onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  async login(id: string, password: string): Promise<UserAccount | null> {
    try {
      // 관리자 계정 하드코딩 체크
      const normalizedId = id.trim().toLowerCase();
      const normalizedPw = password.trim();

      if (normalizedId === 'admin' && normalizedPw === 'admin') {
        return {
          id: 'admin',
          password: '',
          name: '관리자',
          role: 'ADMIN',
          academyId: 'ADMIN',
          school: '관리 본부',
          grade: '-',
          phone: '010-0000-0000',
          signupDate: new Date().toISOString(),
          isAdmin: true
        } as UserAccount;
      }

      // Firebase Auth 로그인
      const email = toEmail(id);

      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Firestore에서 사용자 프로필 가져오기
      const userDoc = await getDoc(doc(db, USERS_COLLECTION, userCredential.user.uid));

      if (userDoc.exists()) {
        return userDoc.data() as UserAccount;
      }

      return null;
    } catch (error: any) {
      console.error('Login error:', error);

      // 에러 메시지 한국어로 변환
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        throw new Error('아이디 또는 비밀번호가 일치하지 않습니다.');
      }
      if (error.code === 'auth/invalid-email') {
        throw new Error('올바른 아이디 형식이 아닙니다.');
      }
      if (error.code === 'auth/too-many-requests') {
        throw new Error('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
      }

      throw new Error('로그인 중 오류가 발생했습니다.');
    }
  },

  async signup(user: UserAccount): Promise<boolean> {
    try {
      const email = toEmail(user.id);

      // Firebase Auth에 사용자 생성
      const userCredential = await createUserWithEmailAndPassword(auth, email, user.password);

      // Firestore에 사용자 프로필 저장
      const userData: UserAccount = {
        ...user,
        id: user.id, // 원래 ID 유지
      };

      await setDoc(doc(db, USERS_COLLECTION, userCredential.user.uid), userData);

      // 가입 후 로그아웃 (로그인 페이지로 돌아가도록)
      await signOut(auth);

      return true;
    } catch (error: any) {
      console.error('Signup error:', error);

      if (error.code === 'auth/email-already-in-use') {
        throw new Error('이미 존재하는 아이디입니다.');
      }
      if (error.code === 'auth/weak-password') {
        throw new Error('비밀번호는 6자 이상이어야 합니다.');
      }
      if (error.code === 'auth/invalid-email') {
        throw new Error('올바른 아이디 형식이 아닙니다.');
      }

      return false;
    }
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },

  async updateUserResult(user: UserAccount): Promise<UserAccount> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('로그인이 필요합니다.');
      }

      // Firestore에서 사용자 문서 업데이트
      await updateDoc(doc(db, USERS_COLLECTION, currentUser.uid), {
        testResult: user.testResult
      });

      return user;
    } catch (error) {
      console.error('Update result error:', error);
      throw error;
    }
  },

  // 관리자/선생님용: 모든 사용자 가져오기
  async getAllUsers(): Promise<UserAccount[]> {
    try {
      const querySnapshot = await getDocs(collection(db, USERS_COLLECTION));
      const users: UserAccount[] = [];

      querySnapshot.forEach((doc) => {
        const userData = doc.data() as UserAccount;
        // Firestore Document ID를 uid 필드에 매핑
        users.push({ ...userData, uid: doc.id });
      });

      return users;
    } catch (error) {
      console.error('Get all users error:', error);
      return [];
    }
  },

  // 관리자용: 사용자 정보 수정
  async updateUser(user: UserAccount): Promise<boolean> {
    try {
      if (!user.uid) throw new Error('User UID is missing');

      // 업데이트할 필드만 추출 (id, password 등 변경 불가 항목 제외 가능하지만, 일단 전체 업데이트 허용)
      // 단, uid 필드는 Firestore에 저장할 필요 없으므로 구조 분해로 제외 가능
      const { uid, ...dataToUpdate } = user;

      await updateDoc(doc(db, USERS_COLLECTION, user.uid), dataToUpdate);
      return true;
    } catch (error) {
      console.error('Update user error:', error);
      return false;
    }
  },


  // 관리자용: 사용자 삭제
  async deleteUser(uid: string): Promise<boolean> {
    try {
      await deleteDoc(doc(db, USERS_COLLECTION, uid));
      return true;
    } catch (error) {
      console.error('Delete user error:', error);
      return false;
    }
  }
};

// --- Asset Service (지문/문항 관리) ---
export const AssetService = {
  async getAllAssets(): Promise<Asset[]> {
    try {
      const querySnapshot = await getDocs(collection(db, ASSETS_COLLECTION));
      const assets: Asset[] = [];

      querySnapshot.forEach((doc) => {
        assets.push({ ...doc.data(), assetId: doc.id } as Asset);
      });

      return assets;
    } catch (error) {
      console.error('Get all assets error:', error);
      return [];
    }
  },

  async getAssetsByGrade(gradeGroup: GradeGroupType): Promise<Asset[]> {
    try {
      const q = query(
        collection(db, ASSETS_COLLECTION),
        where('gradeGroup', '==', gradeGroup)
      );
      const querySnapshot = await getDocs(q);
      const assets: Asset[] = [];

      querySnapshot.forEach((doc) => {
        assets.push({ ...doc.data(), assetId: doc.id } as Asset);
      });

      return assets;
    } catch (error) {
      console.error('Get assets by grade error:', error);
      return [];
    }
  },

  async getApprovedAssets(gradeGroup: GradeGroupType): Promise<Asset[]> {
    try {
      const q = query(
        collection(db, ASSETS_COLLECTION),
        where('gradeGroup', '==', gradeGroup),
        where('status', '==', 'APPROVED')
      );
      const querySnapshot = await getDocs(q);
      const assets: Asset[] = [];

      querySnapshot.forEach((doc) => {
        assets.push({ ...doc.data(), assetId: doc.id } as Asset);
      });

      return assets;
    } catch (error) {
      console.error('Get approved assets error:', error);
      return [];
    }
  },

  async createAsset(asset: Asset): Promise<void> {
    try {
      const assetRef = doc(db, ASSETS_COLLECTION, asset.assetId);
      await setDoc(assetRef, asset);
    } catch (error) {
      console.error('Create asset error:', error);
      throw new Error('자산 생성 중 오류가 발생했습니다.');
    }
  },

  async updateAsset(asset: Asset): Promise<void> {
    try {
      const assetRef = doc(db, ASSETS_COLLECTION, asset.assetId);
      await setDoc(assetRef, asset, { merge: true });
    } catch (error) {
      console.error('Update asset error:', error);
      throw new Error('자산 업데이트 중 오류가 발생했습니다.');
    }
  },

  async updateAssetStatus(assetId: string, status: Asset['status']): Promise<void> {
    try {
      const assetRef = doc(db, ASSETS_COLLECTION, assetId);
      await updateDoc(assetRef, { status });
    } catch (error) {
      console.error('Update asset status error:', error);
      throw new Error('상태 업데이트 중 오류가 발생했습니다.');
    }
  },

  async deleteAsset(assetId: string): Promise<void> {
    try {
      const assetRef = doc(db, ASSETS_COLLECTION, assetId);
      await deleteDoc(assetRef);
    } catch (error) {
      console.error('Delete asset error:', error);
      throw new Error('자산 삭제 중 오류가 발생했습니다.');
    }
  }
};

// --- Config Service (관리자 설정) ---
export const ConfigService = {
  async getConfig(): Promise<AdminConfig | null> {
    try {
      const configDoc = await getDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID));

      if (configDoc.exists()) {
        return configDoc.data() as AdminConfig;
      }

      return null;
    } catch (error) {
      console.error('Get config error:', error);
      return null;
    }
  },

  async saveConfig(config: AdminConfig): Promise<void> {
    try {
      await setDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID), config);
    } catch (error) {
      console.error('Save config error:', error);
      throw new Error('설정 저장 중 오류가 발생했습니다.');
    }
  }
};

// --- Cloud Service (하위 호환성 유지) ---
// 기존 코드와의 호환성을 위해 CloudService도 유지하지만, Firebase 자체가 클라우드이므로 대부분 비활성화
export const CloudService = {
  setProvider(type: 'GOOGLE_DRIVE' | 'FIREBASE') {

  },

  getProviderType() {
    return 'FIREBASE' as const;
  },

  async connectDrive(): Promise<boolean> {
    // Firebase는 자동 연결됨
    return true;
  },

  async pushToCloud() {
    // Firebase는 자동 동기화
  },

  async pullFromCloud() {
    // Firebase는 자동 동기화
    return true;
  },

  isConnected() {
    return auth.currentUser !== null;
  }
};

// --- Session Service (테스트 세션 관리) ---
// MVP v2: 정교한 데이터 수집을 위한 세션 저장 서비스
export const SessionService = {
  /**
   * 테스트 세션 저장
   */
  async saveSession(session: TestSession): Promise<boolean> {
    try {
      await setDoc(doc(db, SESSIONS_COLLECTION, session.sessionId), session);

      return true;
    } catch (error) {
      console.error('[SessionService] 세션 저장 실패:', error);
      return false;
    }
  },

  /**
   * 세션 업데이트 (설문 추가 등)
   */
  async updateSession(sessionId: string, data: Partial<TestSession>): Promise<boolean> {
    try {
      await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data);
      return true;
    } catch (error) {
      console.error('[SessionService] 세션 업데이트 실패:', error);
      return false;
    }
  },

  /**
   * 설문 데이터 추가
   */
  async addSurvey(sessionId: string, survey: PostTestSurvey): Promise<boolean> {
    try {
      await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), { survey });
      return true;
    } catch (error) {
      console.error('[SessionService] 설문 저장 실패:', error);
      return false;
    }
  },

  /**
   * 특정 세션 조회
   */
  async getSession(sessionId: string): Promise<TestSession | null> {
    try {
      const docSnap = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));
      if (docSnap.exists()) {
        return docSnap.data() as TestSession;
      }
      return null;
    } catch (error) {
      console.error('[SessionService] 세션 조회 실패:', error);
      return null;
    }
  },

  /**
   * 유저별 세션 목록 조회
   */
  async getSessionsByUser(userId: string): Promise<TestSession[]> {
    try {
      const q = query(
        collection(db, SESSIONS_COLLECTION),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as TestSession);
    } catch (error) {
      console.error('[SessionService] 유저 세션 조회 실패:', error);
      return [];
    }
  },

  /**
   * 이탈 세션 조회 (분석용)
   */
  async getDropOffSessions(): Promise<TestSession[]> {
    try {
      const snapshot = await getDocs(collection(db, SESSIONS_COLLECTION));
      return snapshot.docs
        .map(doc => doc.data() as TestSession)
        .filter(s => s.dropOff !== undefined);
    } catch (error) {
      console.error('[SessionService] 이탈 세션 조회 실패:', error);
      return [];
    }
  },

  /**
   * 전체 세션 조회 (관리자용)
   */
  async getAllSessions(): Promise<TestSession[]> {
    try {
      const snapshot = await getDocs(collection(db, SESSIONS_COLLECTION));
      return snapshot.docs.map(doc => doc.data() as TestSession);
    } catch (error) {
      console.error('[SessionService] 전체 세션 조회 실패:', error);
      return [];
    }
  }
};

// --- Academy Service (학원 관리) ---
export const AcademyService = {
  // 학원 생성
  async createAcademy(name: string, region: string): Promise<Academy | null> {
    try {
      // 고유 코드 생성 (예: GACHI_A1B2)
      const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `GACHI_${uniqueSuffix}`;

      const newAcademy: Academy = {
        id: crypto.randomUUID(),
        code,
        name,
        region,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, ACADEMIES_COLLECTION, newAcademy.id), newAcademy);
      return newAcademy;
    } catch (error) {
      console.error('Create academy error:', error);
      return null;
    }
  },

  // 전체 학원 목록 조회
  async getAcademies(): Promise<Academy[]> {
    try {
      const querySnapshot = await getDocs(collection(db, ACADEMIES_COLLECTION));
      const academies: Academy[] = [];
      querySnapshot.forEach((doc) => {
        academies.push(doc.data() as Academy);
      });
      return academies;
    } catch (error) {
      console.error('Get all academies error:', error);
      return [];
    }
  },

  // 학원 코드 검증
  async validateAcademyCode(code: string): Promise<Academy | null> {
    try {
      const q = query(
        collection(db, ACADEMIES_COLLECTION),
        where('code', '==', code)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].data() as Academy;
      }
      return null;
    } catch (error) {
      console.error('Validate academy code error:', error);
      return null;
    }
  }
};

// --- Curriculum Service (커리큘럼/주제 관리) ---
export const CurriculumService = {
  // 특정 학년 설정 가져오기
  async getConfig(gradeGroup: GradeGroupType): Promise<GradeCurriculumConfig | null> {
    try {
      // 문서 ID는 공백 제거 등을 위해 간단히 처리하거나, 있는 그대로 사용
      // 여기서는 gradeGroup 문자열을 그대로 ID로 사용 (예: "초등 저학년")
      const docRef = doc(db, CURRICULUM_COLLECTION, gradeGroup);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data() as GradeCurriculumConfig;
      }
      return null;
    } catch (error) {
      console.error('Get curriculum config error:', error);
      return null;
    }
  },

  // 특정 학년 설정 저장/업데이트
  async saveConfig(config: GradeCurriculumConfig): Promise<void> {
    try {
      const docRef = doc(db, CURRICULUM_COLLECTION, config.gradeGroup);
      await setDoc(docRef, config);
    } catch (error) {
      console.error('Save curriculum config error:', error);
      throw new Error('커리큘럼 설정 저장 중 오류가 발생했습니다.');
    }
  },

  // 전체 설정 가져오기 (초기 로딩 등)
  async getAllConfigs(): Promise<GradeCurriculumConfig[]> {
    try {
      const querySnapshot = await getDocs(collection(db, CURRICULUM_COLLECTION));
      const configs: GradeCurriculumConfig[] = [];
      querySnapshot.forEach((doc) => {
        configs.push(doc.data() as GradeCurriculumConfig);
      });
      return configs;
    } catch (error) {
      console.error('Get all curriculum configs error:', error);
      return [];
    }
  }
};

// --- LearningSession Service (차시 관리) ---
export const LearningSessionService = {
  async getAllSessions(): Promise<LearningSession[]> {
    try {
      const querySnapshot = await getDocs(collection(db, LEARNING_SESSIONS_COLLECTION));
      return querySnapshot.docs.map(doc => doc.data() as LearningSession);
    } catch (error) {
      console.error('Get all learning sessions error:', error);
      return [];
    }
  },

  async getApprovedSessions(gradeGroup: GradeGroupType): Promise<LearningSession[]> {
    try {
      const q = query(
        collection(db, LEARNING_SESSIONS_COLLECTION),
        where('gradeGroup', '==', gradeGroup),
        where('status', '==', 'APPROVED')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => doc.data() as LearningSession);
    } catch (error) {
      console.error('Get approved learning sessions error:', error);
      return [];
    }
  },

  async createSession(session: LearningSession): Promise<void> {
    try {
      await setDoc(doc(db, LEARNING_SESSIONS_COLLECTION, session.sessionId), session);
    } catch (error) {
      console.error('Create learning session error:', error);
      throw error;
    }
  },

  async updateSessionStatus(sessionId: string, status: LearningSessionStatus): Promise<void> {
    try {
      await updateDoc(doc(db, LEARNING_SESSIONS_COLLECTION, sessionId), { status });
    } catch (error) {
      console.error('Update learning session status error:', error);
      throw error;
    }
  },

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, LEARNING_SESSIONS_COLLECTION, sessionId));
    } catch (error) {
      console.error('Delete learning session error:', error);
      throw error;
    }
  }
};

