import { renderHook, act } from '@testing-library/react';
import { useSessionGenerator } from '../hooks/useSessionGenerator';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AssetService, LearningSessionService } from '../services/api';

// Mock services
vi.mock('../services/api', () => ({
    AssetService: {
        getAllAssets: vi.fn(),
        createAsset: vi.fn(),
    },
    LearningSessionService: {
        getAllSessions: vi.fn(),
        createSession: vi.fn(),
    },
    ConfigService: {
        getConfig: vi.fn(),
    },
    CurriculumService: {
        getCurriculum: vi.fn(),
    }
}));

// Mock useContentGenerator hook
vi.mock('../hooks/useContentGenerator', () => ({
    useContentGenerator: () => ({
        generatePassage: vi.fn(),
        generateQuestions: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));

// services/gemini을 얕게 모킹 (깊은 import 체인에서 fetch가 실행되는 것 방지)
vi.mock('../services/gemini', async () => {
    return {
        default: {
            generateContent: vi.fn(),
        },
        generateContent: vi.fn(),
        Type: {
            STRING: 'string', NUMBER: 'number', INTEGER: 'integer',
            BOOLEAN: 'boolean', ARRAY: 'array', OBJECT: 'object',
        },
    };
});


describe('useSessionGenerator Hook', () => {
    const mockRefreshAssets = vi.fn();
    const mockRefreshSessions = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with default values', () => {
        const { result } = renderHook(() => useSessionGenerator(mockRefreshAssets, mockRefreshSessions));

        expect(result.current.generatedCount).toBe(0);
        expect(result.current.isGenerating).toBe(false);
        expect(result.current.progress).toBe(0);
        expect(result.current.error).toBeNull();
        expect(result.current.agentStep).toBe('IDLE');
    });
});
