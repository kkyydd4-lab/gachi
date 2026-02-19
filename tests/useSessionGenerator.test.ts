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

// Mock Gemini (needed because useSessionGenerator imports it potentially or indirectly? 
// No, useSessionGenerator uses useContentGenerator. 
// However, the previous error showed useContentGenerator importing gemini. So we might still need to mock gemini if we were testing useContentGenerator.
// But here we are mocking useContentGenerator directly. So we might not need to mock gemini explicitly if we mock the hook.
// Let's keep gemini mock just in case for deep imports, but perform minimal mock.
import { SchemaType } from "@google/generative-ai";
vi.mock('../services/gemini', async () => {
    return {
        default: {
            generateContent: vi.fn(),
        },
        generateContent: vi.fn(),
        Type: SchemaType,
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
