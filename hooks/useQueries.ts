import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AssetService, AuthService, AcademyService, ConfigService } from '../services/api';
import { UserAccount, Asset, Academy, AdminConfig, GradeGroupType, AssetStatus } from '../types';

// Keys
export const QUERY_KEYS = {
    assets: ['assets'] as const,
    users: ['users'] as const,
    academies: ['academies'] as const,
    config: ['config'] as const,
    learningSessions: ['learningSessions'] as const,
};

// Hooks

export const useAssets = () => {
    return useQuery({
        queryKey: QUERY_KEYS.assets,
        queryFn: () => AssetService.getAllAssets(),
    });
};

export const useUsers = () => {
    return useQuery({
        queryKey: QUERY_KEYS.users,
        queryFn: () => AuthService.getAllUsers(),
    });
};

export const useAcademies = () => {
    return useQuery({
        queryKey: QUERY_KEYS.academies,
        queryFn: () => AcademyService.getAcademies(),
    });
};

export const useConfig = () => {
    return useQuery({
        queryKey: QUERY_KEYS.config,
        queryFn: async () => {
            const config = await ConfigService.getConfig();
            return config || {
                gradeGroup: '초등 중학년' as GradeGroupType,
                targetSubject: '종합(인문+사회+과학+예술)',
                difficulty: '중',
                countPerCategory: {},
                promptTemplates: {}
            } as AdminConfig;
        },
    });
};

// Mutations

export const useUpdateAssetStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: AssetStatus }) =>
            AssetService.updateAssetStatus(id, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.assets });
        },
    });

};

export const useUpdateAsset = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (asset: Asset) => AssetService.updateAsset(asset),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.assets });
        },
    });
};


export const useDeleteUser = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (uid: string) => AuthService.deleteUser(uid),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
        },
    });
};

export const useUpdateUser = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (user: UserAccount) => AuthService.updateUser(user),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
        },
    });
};

export const useCreateAcademy = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ name, region }: { name: string; region: string }) =>
            AcademyService.createAcademy(name, region),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.academies });
        },
    });
};

export const useSaveConfig = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (config: AdminConfig) => ConfigService.saveConfig(config),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.config });
        },
    });
};

export const useLearningSessions = () => {
    return useQuery({
        queryKey: QUERY_KEYS.learningSessions,
        queryFn: () => import('../services/api').then(m => m.LearningSessionService.getAllSessions()),
    });
};

export const useUpdateLearningSessionStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ sessionId, status }: { sessionId: string; status: any }) =>
            import('../services/api').then(m => m.LearningSessionService.updateSessionStatus(sessionId, status)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.learningSessions });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.assets });
        },
    });
};

export const useDeleteLearningSession = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (sessionId: string) => {
            const api = await import('../services/api');
            // Get session to find asset IDs
            const sessions = await api.LearningSessionService.getAllSessions();
            const session = sessions.find(s => s.sessionId === sessionId);
            if (session) {
                // Delete all assets in this session
                for (const assetId of session.assetIds) {
                    await api.AssetService.deleteAsset(assetId);
                }
            }
            // Delete session itself
            await api.LearningSessionService.deleteSession(sessionId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.learningSessions });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.assets });
        },
    });
};
