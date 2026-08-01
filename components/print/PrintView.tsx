import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Asset, GradeGroupType, LearningSession, Question } from '../../types';
import { AssetService, LearningSessionService } from '../../services/api';
import { SAMPLE_ASSETS, SAMPLE_SESSION } from './sampleData';
import '../../src/print.css';

type PrintMode = 'paper' | 'answer' | 'key';

const CIRCLED = ['①', '②', '③', '④', '⑤'] as const;

// 학년군별 제한시간 (DiagnosticView와 동일 기준)
const GRADE_TIME_LIMITS: Record<GradeGroupType, number> = {
    '초등 저학년': 20,
    '초등 중학년': 25,
    '초등 고학년': 30,
    '중등': 40,
};

/** 전체 통합 번호가 매겨진 문항 */
interface NumberedQuestion extends Question {
    no: number;
}

/**
 * 지문 마크업을 인쇄용으로 렌더링한다.
 * 화면용(utils/renderPassageContent)은 색상 위주라 흑백 인쇄에서 구분이 사라지므로,
 * 인쇄에서는 밑줄·테두리 같은 형태로만 표현한다. 인식하는 문법은 동일하다.
 */
const renderPrintPassage = (content: string): React.ReactNode[] => {
    const pattern = /(\[밑줄:.*?\]|\[문장밑줄:.*?\]|\[빈칸\]|[㉠-㉯]|[ⓐ-ⓔ]|\(   \)|\(  [ㄱ-ㅎ]  \)|\(  [㉠-㉯]  \))/g;

    return content.split(pattern).map((part, i) => {
        if (part.startsWith('[밑줄:')) {
            return <span key={i} className="pr-underline">{part.match(/\[밑줄:(.*?)\]/)?.[1]}</span>;
        }
        if (part.startsWith('[문장밑줄:')) {
            return <span key={i} className="pr-sentence-underline">{part.match(/\[문장밑줄:(.*?)\]/)?.[1]}</span>;
        }
        if (part === '[빈칸]' || part === '(   )') {
            return <span key={i} className="pr-gap">빈칸</span>;
        }
        if (/^[㉠-㉩]$/.test(part) || /^[ⓐ-ⓔ]$/.test(part)) {
            return <span key={i} className="pr-marker">{part}</span>;
        }
        if (/^[㉪-㉯]$/.test(part) || part.match(/\(\s*[ㄱ-ㅎ㉠-㉯]\s*\)/)) {
            return <span key={i} className="pr-gap-box">{part}</span>;
        }
        return part;
    });
};

/** 선택지 길이에 따라 배치 열 수를 정한다 (실제 문제집 조판 방식) */
const optionColumns = (options: string[]): 1 | 2 | 5 => {
    const longest = options.reduce((m, o) => Math.max(m, (o || '').length), 0);
    if (longest <= 6) return 5;   // "옮깁니다" 같은 짧은 낱말 → 한 줄에 다섯 개
    if (longest <= 20) return 2;  // 중간 길이 → 두 줄 배치
    return 1;                     // 문장형 → 한 줄에 하나
};

const QuestionBlock: React.FC<{ q: NumberedQuestion }> = ({ q }) => {
    const options = Array.isArray(q.options) ? q.options : [];
    const cols = optionColumns(options);

    return (
        <div className="pr-q">
            <div className="pr-q-head">
                <span className="pr-q-no">{q.no}.</span>
                <span>{q.question}</span>
            </div>

            {q.context?.content && (
                <div className="pr-q-context">
                    <div className="pr-q-context-label">&lt; 보 기 &gt;</div>
                    {q.context.content}
                </div>
            )}

            <div className={`pr-opts cols-${cols}`}>
                {options.map((opt, i) => (
                    <div key={i} className="pr-opt">
                        <span className="pr-opt-no">{CIRCLED[i] ?? `(${i + 1})`}</span>
                        <span>{opt}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface PrintViewProps {
    /** 정적 경로(/print/sample)에서는 URL 파라미터가 없으므로 직접 전달한다 */
    sessionIdProp?: string;
}

const PrintView: React.FC<PrintViewProps> = ({ sessionIdProp }) => {
    const { sessionId: paramSessionId } = useParams<{ sessionId: string }>();
    const sessionId = sessionIdProp ?? paramSessionId;
    const navigate = useNavigate();

    const [mode, setMode] = useState<PrintMode>('paper');
    const [session, setSession] = useState<LearningSession | null>(null);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            // 파라미터가 없으면 로딩 상태로 멈추지 않고 명확히 실패시킨다
            if (!sessionId) {
                setError('차시 ID가 지정되지 않았습니다.');
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError('');

            // 레이아웃 확인용 샘플 (Firestore 접근 없음)
            if (sessionId === 'sample') {
                setSession(SAMPLE_SESSION);
                setAssets(SAMPLE_ASSETS);
                setIsLoading(false);
                return;
            }

            try {
                const found = await LearningSessionService.getSessionById(sessionId);
                if (!found) {
                    setError('차시를 찾을 수 없습니다.');
                    setIsLoading(false);
                    return;
                }
                setSession(found);

                // 차시에 적힌 순서대로 지문을 가져온다 (없는 지문은 건너뜀)
                const loaded = await Promise.all(found.assetIds.map(id => AssetService.getAssetById(id)));
                const valid = loaded.filter((a): a is Asset => a !== null);
                if (valid.length === 0) setError('이 차시에 연결된 지문을 불러오지 못했습니다.');
                setAssets(valid);
            } catch (e) {
                console.error('[Print] 불러오기 실패:', e);
                setError('데이터를 불러오는 중 오류가 발생했습니다.');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [sessionId]);

    // 지문별로 문항에 전체 통합 번호를 매긴다 (1번부터 이어서)
    const sections = useMemo(() => {
        let counter = 0;
        return assets.map(asset => {
            const questions: NumberedQuestion[] = (asset.questions || []).map(q => ({ ...q, no: ++counter }));
            return { asset, questions };
        });
    }, [assets]);

    const allQuestions = useMemo(() => sections.flatMap(s => s.questions), [sections]);
    const timeLimit = session ? GRADE_TIME_LIMITS[session.gradeGroup] ?? 30 : 30;

    if (isLoading) {
        return <div style={{ padding: 80, textAlign: 'center', color: '#6b7280' }}>인쇄용 문서를 준비하고 있습니다...</div>;
    }

    if (error || !session) {
        return (
            <div style={{ padding: 80, textAlign: 'center' }}>
                <p style={{ fontWeight: 700, marginBottom: 16 }}>{error || '차시 정보가 없습니다.'}</p>
                <button onClick={() => navigate(-1)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db', cursor: 'pointer' }}>
                    돌아가기
                </button>
            </div>
        );
    }

    const docTitle =
        mode === 'paper' ? '문해력 평가지'
            : mode === 'answer' ? '답안지'
                : '정답 및 해설';

    const Header = () => (
        <div className="pr-head">
            <div className="pr-head-top">
                <div>
                    <div className="pr-brand">가치인 문해력 평가</div>
                    <h1 className="pr-title">{session.title}</h1>
                </div>
                <div className="pr-meta">
                    <div>{session.gradeGroup} · 난이도 {session.difficulty}</div>
                    <div>총 {allQuestions.length}문항 · 제한시간 {timeLimit}분</div>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{docTitle}</div>
                </div>
            </div>
            <div className="pr-fields">
                <div className="pr-field"><span>이름</span><span className="pr-blank wide" /></div>
                <div className="pr-field"><span>학교</span><span className="pr-blank wide" /></div>
                <div className="pr-field"><span>날짜</span><span className="pr-blank" /></div>
                <div className="pr-field" style={{ marginLeft: 'auto' }}><span>점수</span><span className="pr-blank narrow" /></div>
            </div>
        </div>
    );

    return (
        <div className="print-root">
            {/* 화면 전용 도구 모음 — 인쇄 시 사라짐 */}
            <div className="pr-toolbar no-print">
                <button className="pr-tab" onClick={() => navigate(-1)}>← 돌아가기</button>
                <button className={`pr-tab ${mode === 'paper' ? 'active' : ''}`} onClick={() => setMode('paper')}>문제지</button>
                <button className={`pr-tab ${mode === 'answer' ? 'active' : ''}`} onClick={() => setMode('answer')}>답안지</button>
                <button className={`pr-tab ${mode === 'key' ? 'active' : ''}`} onClick={() => setMode('key')}>정답·해설</button>
                <span className="pr-hint">인쇄 대화상자에서 용지 A4 · 배율 100% · 여백 '기본'으로 두세요</span>
                <button className="pr-print-btn" onClick={() => window.print()}>인쇄 / PDF 저장</button>
            </div>

            {/* ---------- 문제지 ---------- */}
            {mode === 'paper' && sections.map((sec, idx) => {
                const first = sec.questions[0]?.no;
                const last = sec.questions[sec.questions.length - 1]?.no;
                const range = first === last ? `${first}` : `${first}~${last}`;

                return (
                    <div className="sheet" key={sec.asset.assetId}>
                        {idx === 0 && <Header />}

                        <div className="pr-section">
                            <div className="pr-section-label">
                                <span className="range">[{range}]</span>
                                다음 글을 읽고 물음에 답하시오.
                                <span className="pr-subject">· {sec.asset.subject}</span>
                            </div>

                            <div className="pr-passage">
                                <h2 className="pr-passage-title">{sec.asset.title}</h2>
                                <div className="pr-passage-body">{renderPrintPassage(sec.asset.content || '')}</div>
                            </div>

                            {sec.questions.map(q => <QuestionBlock key={q.no} q={q} />)}

                            <div className="pr-foot">
                                <span>{session.title}</span>
                                <span>지문 {idx + 1} / {sections.length}</span>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* ---------- 답안지 ---------- */}
            {mode === 'answer' && (
                <div className="sheet">
                    <Header />
                    <div className="pr-block-title">답안 표기란</div>
                    <p style={{ fontSize: '9.5pt', color: '#6b7280', marginBottom: '5mm' }}>
                        정답이라고 생각하는 번호에 표시하세요.
                    </p>
                    <div className="pr-omr">
                        {allQuestions.map(q => (
                            <div className="pr-omr-row" key={q.no}>
                                <span className="pr-omr-no">{q.no}</span>
                                <span className="pr-omr-cat">{q.category}</span>
                                <span className="pr-omr-marks">
                                    {CIRCLED.map((c, i) => (
                                        <span className="pr-omr-mark" key={i}>{i + 1}</span>
                                    ))}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="pr-foot">
                        <span>{session.title} · 답안지</span>
                        <span>총 {allQuestions.length}문항</span>
                    </div>
                </div>
            )}

            {/* ---------- 정답 및 해설 (교사용) ---------- */}
            {mode === 'key' && (
                <div className="sheet">
                    <div className="pr-head">
                        <div className="pr-head-top">
                            <div>
                                <div className="pr-brand">가치인 문해력 평가 · 교사용</div>
                                <h1 className="pr-title">{session.title} 정답 및 해설</h1>
                            </div>
                            <div className="pr-meta">
                                <div>{session.gradeGroup} · 난이도 {session.difficulty}</div>
                                <div>총 {allQuestions.length}문항</div>
                            </div>
                        </div>
                    </div>

                    <div className="pr-block-title">정답표</div>
                    <table className="pr-key-table">
                        <thead>
                            <tr>
                                <th style={{ width: '14%' }}>문항</th>
                                <th style={{ width: '20%' }}>정답</th>
                                <th>평가 역량</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allQuestions.map(q => (
                                <tr key={q.no}>
                                    <td>{q.no}</td>
                                    <td className="pr-key-answer">{CIRCLED[q.answer - 1] ?? q.answer}</td>
                                    <td>{q.category}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="pr-block-title">해설</div>
                    {allQuestions.map(q => (
                        <div className="pr-exp" key={q.no}>
                            <div className="pr-exp-head">
                                {q.no}. 정답 {CIRCLED[q.answer - 1] ?? q.answer}
                                <span className="pr-exp-tag">{q.category}</span>
                            </div>
                            <div className="pr-exp-body">
                                {q.rationale || '해설이 등록되지 않은 문항입니다.'}
                            </div>
                        </div>
                    ))}

                    <div className="pr-foot">
                        <span>{session.title} · 정답 및 해설</span>
                        <span>교사용 — 학생 배포 금지</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PrintView;
