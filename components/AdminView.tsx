import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { AdminConfig, UserAccount, GradeGroupType, Asset, Academy } from '../types';
import { AssetService, ConfigService, AuthService, CloudService, AcademyService, CurriculumService } from '../services/api';
import { DriveClient } from '../services/googleDrive';
import { useConfig, useUsers, useAssets, useAcademies, useUpdateAssetStatus, useUpdateAsset, useDeleteUser, useUpdateUser, useCreateAcademy, useSaveConfig, useLearningSessions, useUpdateLearningSessionStatus, useDeleteLearningSession } from '../hooks/useQueries';
import AdminAnalytics from './AdminAnalytics';

// Sub-components
import AdminHeader from './admin/AdminHeader';
import DashboardTab from './admin/DashboardTab';
import GenerateTab from './admin/GenerateTab';
import ReviewTab from './admin/ReviewTab';
import UsersTab from './admin/UsersTab';
import AcademyTab from './admin/AcademyTab';
import SettingsModal from './admin/SettingsModal';
import UserEditModal from './admin/UserEditModal';

interface AdminViewProps {
  onBack: () => void;
}

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// 등급별 세부 출제 아키텍처
const GRADE_ARCHITECTURES: Record<GradeGroupType, Record<string, number>> = {
  '초등 저학년': { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 3, '구조적 이해': 0, '비판적 이해': 0 },
  '초등 중학년': { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 4, '구조적 이해': 2, '비판적 이해': 2 },
  '초등 고학년': { '어휘력': 4, '사실적 이해': 5, '추론적 이해': 5, '구조적 이해': 3, '비판적 이해': 3 },
  '중등': { '어휘력': 4, '사실적 이해': 4, '추론적 이해': 6, '구조적 이해': 5, '비판적 이해': 6 },
};

const rubricGuides: Record<string, { desc: string, logic: string, icon: string, color: string }> = {
  '어휘력': { desc: '단어의 사전적/문맥적 의미', logic: '지문 내 [밑줄] 어휘의 유의어/반의어 및 쓰임', icon: 'font_download', color: 'bg-blue-500' },
  '사실적 이해': { desc: '명시적 정보의 정확한 확인', logic: '여러 문단에 흩어진 세부 정보 일치 여부 판별', icon: 'fact_check', color: 'bg-green-500' },
  '추론적 이해': { desc: '숨겨진 의미 및 인과관계', logic: '[빈칸] 추론 및 필자의 숨겨진 의도/전제 분석', icon: 'psychology', color: 'bg-purple-500' },
  '구조적 이해': { desc: '글의 전개 방식 및 구성', logic: '문단 간 관계, 서술 전략, 핵심 요약 및 제목', icon: 'account_tree', color: 'bg-amber-500' },
  '비판적 이해': { desc: '타당성 및 가치 판단', logic: '주장의 타당성, 근거 신뢰성, 편향성 평가 및 대안', icon: 'gavel', color: 'bg-red-500' },
};

const AdminView: React.FC<AdminViewProps> = ({ onBack }) => {
  /* 
   * TanStack Query Hooks 
   * - Phase 2-1: Replacing local state/useEffect with React Query
   */
  const { data: configData, refetch: refetchConfig } = useConfig();
  const { data: users = [], refetch: refetchUsers } = useUsers();
  const { data: assets = [], refetch: refetchAssets } = useAssets();
  const { data: academies = [], refetch: refetchAcademies } = useAcademies();
  const { data: learningSessions = [], refetch: refetchLearningSessions } = useLearningSessions();

  const [tab, setTab] = useState<'dashboard' | 'generate' | 'review' | 'users' | 'analytics' | 'academy'>('dashboard');

  // Local config state for editing (synced with fetched config)
  const [config, setConfig] = useState<AdminConfig>({
    gradeGroup: '초등 중학년',
    targetSubject: '종합(인문+사회+과학+예술)',
    difficulty: '중',
    countPerCategory: GRADE_ARCHITECTURES['초등 중학년'],
    promptTemplates: {}
  });

  const [filterStatus, setFilterStatus] = useState<'ALL' | 'CANDIDATE' | 'APPROVED' | 'REJECTED'>('CANDIDATE');

  // Academy State (New Creation)
  const [newAcademyName, setNewAcademyName] = useState('');
  const [newAcademyRegion, setNewAcademyRegion] = useState('');

  // Cloud Sync State
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [cloudProvider, setCloudProvider] = useState<'GOOGLE_DRIVE' | 'FIREBASE'>('GOOGLE_DRIVE');

  // Settings Inputs
  const [inputClientId, setInputClientId] = useState('');
  const [inputApiKey, setInputApiKey] = useState('');

  // Prompt Tuning State
  const [currentPromptText, setCurrentPromptText] = useState('');
  const [aiEditRequest, setAiEditRequest] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // User Management State
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Mutations
  const updateAssetStatusMutation = useUpdateAssetStatus();
  const updateAssetMutation = useUpdateAsset();
  const deleteUserMutation = useDeleteUser();
  const updateUserMutation = useUpdateUser();
  const createAcademyMutation = useCreateAcademy();
  const saveConfigMutation = useSaveConfig();
  const updateLearningSessionStatusMutation = useUpdateLearningSessionStatus();
  const deleteLearningSessionMutation = useDeleteLearningSession();

  // Sync config from query to local state
  useEffect(() => {
    if (configData) {
      setConfig(prev => ({ ...configData, targetSubject: '종합(인문+사회+과학+예술)' }));
    }
  }, [configData]);

  // Sync Prompt Text when config changes
  useEffect(() => {
    const template = config.promptTemplates?.[config.gradeGroup] || getDefaultPrompt(config.gradeGroup);
    setCurrentPromptText(template);
  }, [config.gradeGroup, config.promptTemplates]);

  // Initialize Cloud Settings
  useEffect(() => {
    setIsDriveConnected(CloudService.isConnected());
    setCloudProvider(CloudService.getProviderType());
    setInputClientId(DriveClient.getClientId());
    setInputApiKey(DriveClient.getApiKey());
  }, []);

  const handleDeleteUser = async (user: UserAccount) => {
    if (!user.uid) return;
    if (confirm(`'${user.name}' 사용자를 정말 삭제하시겠습니까?`)) {
      deleteUserMutation.mutate(user.uid, {
        onSuccess: () => alert('삭제되었습니다.'),
        onError: () => alert('삭제 실패'),
      });
    }
  };

  const handleUpdateUser = (updatedUser: UserAccount) => {
    updateUserMutation.mutate(updatedUser, {
      onSuccess: () => {
        alert('수정되었습니다.');
        setIsEditModalOpen(false);
        setEditingUser(null);
      },
      onError: () => alert('수정 실패'),
    });
  };

  const openEditModal = (user: UserAccount) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const handleDriveConnect = async () => {
    setIsSyncing(true);
    const success = await CloudService.connectDrive();
    setIsSyncing(false);
    if (success) {
      setIsDriveConnected(true);
      const providerName = cloudProvider === 'FIREBASE' ? 'Firebase' : '구글 드라이브';
      alert(`${providerName}와 성공적으로 연결되었습니다.\n데이터가 동기화됩니다.`);
      // Refresh all data
      refetchUsers();
      refetchAssets();
    } else {
      if (cloudProvider === 'GOOGLE_DRIVE' && confirm("연결에 실패했습니다. 설정에서 Client ID를 확인하시겠습니까?")) {
        setShowSettingsModal(true);
      }
    }
  };

  const handleSaveSettings = () => {
    if (inputClientId && inputApiKey) DriveClient.setCredentials(inputClientId, inputApiKey);
    CloudService.setProvider(cloudProvider);
    alert('설정이 저장되었습니다. 페이지를 새로고침하여 적용해주세요.');
    window.location.reload();
  };

  const getDefaultPrompt = (grade: GradeGroupType) => {
    const low = `[Role]\nYou are a 'Literacy Education Expert' for Elementary Grades 1-2.\n\n[Target Audience]\n- Age: 7-8 years old\n- Characteristics: Decoding stage. Familiar with daily life routines. Attention span is short.\n\n[Passage Guidelines]\n- Length: 250-300 characters (Korean)\n- Topics: School life, Family, Friends, Playground, Weather, Animals.\n- Sentence Structure: Simple sentences. Avoid complex clauses.\n- Vocabulary: Basic everyday words (Tier 1 vocabulary).\n- Tone: Friendly, rhythmic, and warm.`;
    const mid = `[Role]\nYou are a 'Literacy Education Expert' for Elementary Grades 3-4.\n\n[Target Audience]\n- Age: 9-10 years old\n- Characteristics: Value explicit knowledge. Beginning to understand abstract ideas.\n\n[Passage Guidelines]\n- Length: 400-500 characters\n- Topics: Science facts, Biographies, Cultural heritage, Community rules, Folk tales.\n- Sentence Structure: Compound sentences using conjunctions.\n- Vocabulary: Includes some subject-specific terms (Tier 2 vocabulary).\n- Tone: Informative and explanatory.`;
    const high = `[Role]\nYou are a 'Literacy Education Expert' for Elementary Grades 5-6.\n\n[Target Audience]\n- Age: 11-12 years old\n- Characteristics: Abstract thinking capabilities. Critical view of society.\n\n[Passage Guidelines]\n- Length: 600-800 characters\n- Topics: Environmental issues, History, Basic scientific principles, Argumentative essays.\n- Sentence Structure: Complex sentences with relative clauses.\n- Vocabulary: Abstract concepts and Sino-Korean words.\n- Tone: Logical, persuasive, or objective description.`;
    const middle = `[Role]\nYou are a 'Literacy Education Expert' for Middle School Students.\n\n[Target Audience]\n- Age: 13-15 years old\n- Characteristics: Formal operational stage.\n\n[Passage Guidelines]\n- Length: 900-1,200 characters\n- Topics: Etihcs of AI, Global economy, Philosophy, Modern literature criticism, Social justice.\n- Sentence Structure: Academic and formal phrasing.\n- Vocabulary: Academic vocabulary (Tier 3) and literary terms.\n- Tone: Analytical, critical, and sophisticated.`;

    if (grade === '초등 저학년') return low;
    if (grade === '초등 중학년') return mid;
    if (grade === '초등 고학년') return high;
    return middle;
  };

  const applyPreset = (group: GradeGroupType) => {
    const newCounts = GRADE_ARCHITECTURES[group] || GRADE_ARCHITECTURES['초등 중학년'];
    setConfig({ ...config, gradeGroup: group, countPerCategory: { ...newCounts } });
    setCurrentPromptText(config.promptTemplates?.[group] || getDefaultPrompt(group));
  };

  const handleSaveConfig = () => {
    const updatedTemplates = { ...config.promptTemplates, [config.gradeGroup]: currentPromptText };
    const newConfig = { ...config, promptTemplates: updatedTemplates };

    saveConfigMutation.mutate(newConfig, {
      onSuccess: () => {
        // Also try to update legacy CurriculumService if needed (fire and forget)
        try {
          CurriculumService.getConfig(config.gradeGroup).then(cur => {
            CurriculumService.saveConfig({
              gradeGroup: config.gradeGroup,
              topics: cur?.topics || [],
              categories: config.countPerCategory,
              config: {
                charCount: cur?.config?.charCount || '400~500자',
                style: cur?.config?.style || '설명문',
                generateCount: cur?.config?.generateCount || 1,
                difficulty: config.difficulty,
                instruction: config.customInstruction || '',
                basePrompt: currentPromptText
              }
            });
          });
        } catch (e) { console.error('[Sync] Failed:', e); }

        setConfig(newConfig); // Update local state
        alert(`[${config.gradeGroup}] 설정 및 프롬프트가 저장되었습니다.`);
      }
    });
  };

  const handleAiEdit = async () => {
    if (!aiEditRequest) return;
    setIsAiProcessing(true);
    try {
      const msg = `당신은 교육공학 프롬프트 엔지니어입니다. 다음 프롬프트를 사용자의 요청에 맞춰 수정하세요.\n\n[프롬프트]\n${currentPromptText}\n\n[요청]\n${aiEditRequest}`;
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: [{ parts: [{ text: msg }] }] });
      setCurrentPromptText(res.text || currentPromptText);
      setAiEditRequest('');
    } catch (e) { alert('AI 수정 오류'); } finally { setIsAiProcessing(false); }
  };

  const updateAssetStatus = (assetId: string, status: Asset['status']) => {
    updateAssetStatusMutation.mutate({ id: assetId, status });
  };

  const deleteAsset = async (assetId: string) => {
    if (confirm('이 문항을 영구적으로 삭제하시겠습니까? 복구할 수 없습니다.')) {
      try {
        await AssetService.deleteAsset(assetId);
        refetchAssets();
      } catch (e) {
        alert('삭제 실패');
      }
    }
  };

  const bulkDeleteRejected = async () => {
    const rejectedAssets = assets.filter(a => a.status === 'REJECTED');
    if (rejectedAssets.length === 0) return;

    if (confirm(`반려된 문항 ${rejectedAssets.length}개를 모두 영구 삭제하시겠습니까?`)) {
      try {
        for (const asset of rejectedAssets) {
          await AssetService.deleteAsset(asset.assetId);
        }
        refetchAssets();
        alert('삭제되었습니다.');
      } catch (e) {
        alert('일부 삭제 실패');
      }
    }
  };

  const handleCreateAcademy = () => {
    if (!newAcademyName || !newAcademyRegion) return alert('입력 누락');
    createAcademyMutation.mutate({ name: newAcademyName, region: newAcademyRegion }, {
      onSuccess: (created) => {
        if (created) {
          alert(`등록 완료: ${created.code}`);
          setNewAcademyName(''); setNewAcademyRegion('');
        }
      }
    });
  };

  const totalQuestions = Object.values(config.countPerCategory).reduce((a, b) => (a as number) + (b as number), 0);
  const filteredAssets = assets.filter(a => (filterStatus === 'ALL' || a.status === filterStatus));

  return (
    <div className="flex flex-col min-h-screen bg-[#F1F5F9] font-display">
      <AdminHeader
        onBack={onBack}
        isDriveConnected={isDriveConnected}
        cloudProvider={cloudProvider}
        isSyncing={isSyncing}
        handleDriveConnect={handleDriveConnect}
        setShowSettingsModal={setShowSettingsModal}
        tab={tab}
        setTab={setTab}
      />

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          cloudProvider={cloudProvider}
          setCloudProvider={setCloudProvider}
          inputClientId={inputClientId}
          setInputClientId={setInputClientId}
          inputApiKey={inputApiKey}
          setInputApiKey={setInputApiKey}
          handleSaveSettings={handleSaveSettings}
        />
      )}

      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full">
        {tab === 'dashboard' && (
          <DashboardTab
            assets={assets}
            learningSessions={learningSessions}
          />
        )}
        {tab === 'generate' && (
          <GenerateTab
            onRefreshAssets={refetchAssets}
            onRefreshSessions={refetchLearningSessions}
          />
        )}
        {tab === 'review' && (
          <ReviewTab
            config={config}
            filteredAssets={filteredAssets}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            updateAssetStatus={updateAssetStatus}
            updateAsset={(asset) => updateAssetMutation.mutate(asset)}
            deleteAsset={deleteAsset}
            bulkDeleteRejected={bulkDeleteRejected}
            learningSessions={learningSessions}
            updateLearningSessionStatus={(sessionId, status) => updateLearningSessionStatusMutation.mutate({ sessionId, status })}
            deleteLearningSession={(sessionId) => deleteLearningSessionMutation.mutate(sessionId)}
          />
        )}
        {tab === 'users' && (
          <UsersTab
            users={users}
            academies={academies}
            openEditModal={openEditModal}
            handleDeleteUser={handleDeleteUser}
          />
        )}
        {tab === 'analytics' && <AdminAnalytics isVisible={tab === 'analytics'} />}
        {tab === 'academy' && (
          <AcademyTab
            academies={academies}
            newAcademyName={newAcademyName}
            setNewAcademyName={setNewAcademyName}
            newAcademyRegion={newAcademyRegion}
            setNewAcademyRegion={setNewAcademyRegion}
            handleCreateAcademy={handleCreateAcademy}
          />
        )}
      </main>

      {isEditModalOpen && editingUser && (
        <UserEditModal
          user={editingUser}
          academies={academies}
          onClose={() => { setIsEditModalOpen(false); setEditingUser(null); }}
          onSave={handleUpdateUser}
        />
      )}
    </div>
  );
};

export default AdminView;
