import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Asset, GradeGroupType, LearningSession, Question } from '../../types';
import { AssetService, LearningSessionService } from '../../services/api';
import { SAMPLE_ASSETS, SAMPLE_SESSION } from './sampleData';
import '../../src/print.css';

type PrintMode = 'paper' | 'answer' | 'key';

const CIRCLED = ['①', '②', '③', '④', '⑤'] as const;

// A4 기준 치수 (mm). .sheet 의 padding, @page margin과 반드시 일치해야 한다.
const COL_HEIGHT_MM = 297 - 14 - 12;

const GRADE_TIME_LIMITS: Record<GradeGroupType, number> = {
    '초등 저학년': 20,
    '초등 중학년': 25,
    '초등 고학년': 30,
    '중등': 40,
};

interface NumberedQuestion extends Question {
    no: number;
}

/** 쪽에 담기는 최소 단위. 이 단위는 페이지 중간에서 쪼개지지 않는다. */
interface Block {
    key: string;
    node: React.ReactNode;
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

/** 선택지 길이에 따라 배치 열 수를 정한다 (2단 조판에서는 항상 1열) */
const optionColumns = (options: string[], cols: number): 1 | 2 | 5 => {
    if (cols === 2) return 1;
    const longest = options.reduce((m, o) => Math.max(m, (o || '').length), 0);
    if (longest <= 6) return 5;
    if (longest <= 20) return 2;
    return 1;
};

const QuestionBlock: React.FC<{ q: NumberedQuestion; cols: number }> = ({ q, cols }) => {
    const options = Array.isArray(q.options) ? q.options : [];
    const oc = optionColumns(options, cols);

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

            <div className={`pr-opts cols-${oc}`}>
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

/**
 * 측정된 블록 높이를 바탕으로 단·쪽에 채워 넣는다.
 * 반환값: pages[쪽][단] = 블록 key 목록
 */
function paginate(
    groups: Block[][],
    colsPerPage: number,
    colHeight: number,
    heights: Map<string, number>,
): string[][][] {
    const pages: string[][][] = [];

    for (const blocks of groups) {
        let page: string[][] = [[]];
        let col = 0;
        let used = 0;

        for (const b of blocks) {
            const h = heights.get(b.key) ?? 0;
            // 현재 단에 안 들어가면 다음 단, 단이 다 차면 다음 쪽
            if (used > 0 && used + h > colHeight) {
                col += 1;
                if (col >= colsPerPage) {
                    pages.push(page);
                    page = [[]];
                    col = 0;
                } else {
                    page.push([]);
                }
                used = 0;
            }
            page[col].push(b.key);
            used += h;
        }
        pages.push(page);
    }
    return pages;
}

interface PrintViewProps {
    /** 정적 경로(/print/sample)에서는 URL 파라미터가 없으므로 직접 전달한다 */
    sessionIdProp?: string;
}

const PrintView: React.FC<PrintViewProps> = ({ sessionIdProp }) => {
    const { sessionId: paramSessionId } = useParams<{ sessionId: string }>();
    const sessionId = sessionIdProp ?? paramSessionId;
    const navigate = useNavigate();

    const [mode, setMode] = useState<PrintMode>('paper');
    const [cols, setCols] = useState<1 | 2>(1);
    const [session, setSession] = useState<LearningSession | null>(null);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // 측정 결과
    const measureRef = useRef<HTMLDivElement>(null);
    const [heights, setHeights] = useState<Map<string, number> | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!sessionId) {
                setError('차시 ID가 지정되지 않았습니다.');
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError('');

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

    const sections = useMemo(() => {
        let counter = 0;
        return assets.map(asset => {
            const questions: NumberedQuestion[] = (asset.questions || []).map(q => ({ ...q, no: ++counter }));
            return { asset, questions };
        });
    }, [assets]);

    const allQuestions = useMemo(() => sections.flatMap(s => s.questions), [sections]);
    const timeLimit = session ? GRADE_TIME_LIMITS[session.gradeGroup] ?? 30 : 30;

    const docTitle =
        mode === 'paper' ? '문해력 평가지'
            : mode === 'answer' ? '답안지'
                : '정답 및 해설';

    const header = (withFields: boolean) => (
        <div className="pr-head">
            <div className="pr-head-top">
                <div>
                    <div className="pr-brand">가치인 문해력 평가</div>
                    <h1 className="pr-title">{session?.title}</h1>
                </div>
                <div className="pr-meta">
                    <div>{session?.gradeGroup} · 난이도 {session?.difficulty}</div>
                    <div>총 {allQuestions.length}문항 · 제한시간 {timeLimit}분</div>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{docTitle}</div>
                </div>
            </div>
            {withFields && (
                <div className="pr-fields">
                    <div className="pr-field"><span>이름</span><span className="pr-blank wide" /></div>
                    <div className="pr-field"><span>학교</span><span className="pr-blank wide" /></div>
                    <div className="pr-field"><span>날짜</span><span className="pr-blank" /></div>
                    <div className="pr-field" style={{ marginLeft: 'auto' }}><span>점수</span><span className="pr-blank narrow" /></div>
                </div>
            )}
        </div>
    );

    /**
     * 쪽 나눔의 단위가 되는 블록 목록.
     * 바깥 배열의 각 항목은 "새 쪽에서 시작하는 묶음"이다.
     */
    const groups: Block[][] = useMemo(() => {
        if (!session) return [];

        if (mode === 'paper') {
            const perSection = sections.map((sec, idx) => {
                const first = sec.questions[0]?.no;
                const last = sec.questions[sec.questions.length - 1]?.no;
                const range = first === last ? `${first}` : `${first}~${last}`;
                const blocks: Block[] = [];

                if (idx === 0) {
                    blocks.push({ key: 'head', node: header(false) });
                    blocks.push({
                        key: 'notice',
                        node: (
                            <p className="pr-notice">
                                ※ 이 문제지에는 답을 적지 마세요. 답은 답안지에만 표시합니다.
                            </p>
                        ),
                    });
                }
                blocks.push({
                    key: `${idx}-label`,
                    node: (
                        <div className="pr-section-label">
                            <span className="range">[{range}]</span>
                            다음 글을 읽고 물음에 답하시오.
                            <span className="pr-subject">· {sec.asset.subject}</span>
                        </div>
                    ),
                });
                blocks.push({
                    key: `${idx}-passage`,
                    node: (
                        <div className="pr-passage">
                            <h2 className="pr-passage-title">{sec.asset.title}</h2>
                            <div className="pr-passage-body">{renderPrintPassage(sec.asset.content || '')}</div>
                        </div>
                    ),
                });
                sec.questions.forEach(q => {
                    blocks.push({ key: `q-${q.no}`, node: <QuestionBlock q={q} cols={cols} /> });
                });
                blocks.push({
                    key: `${idx}-foot`,
                    node: (
                        <div className="pr-foot">
                            <span>{session.title}</span>
                            <span>지문 {idx + 1} / {sections.length}</span>
                        </div>
                    ),
                });
                return blocks;
            });

            // 1단: 지문마다 새 쪽에서 시작 (초등용 — 여유롭게 읽고 풀도록)
            // 2단: 문제집처럼 단을 이어서 채운다 (빈 단이 생기지 않아 쪽수가 크게 준다)
            return cols === 2 ? [perSection.flat()] : perSection;
        }

        if (mode === 'answer') {
            const blocks: Block[] = [
                { key: 'head', node: header(true) },
                { key: 'title', node: <div className="pr-block-title">답안 표기란</div> },
                {
                    key: 'hint',
                    node: (
                        <p style={{ fontSize: '9.5pt', color: '#6b7280', marginBottom: '5mm' }}>
                            정답이라고 생각하는 번호에 표시하세요.
                        </p>
                    ),
                },
                ...allQuestions.map(q => ({
                    key: `omr-${q.no}`,
                    node: (
                        <div className="pr-omr-row">
                            <span className="pr-omr-no">{q.no}</span>
                            <span className="pr-omr-cat">{q.category}</span>
                            <span className="pr-omr-marks">
                                {CIRCLED.map((_, i) => (
                                    <span className="pr-omr-mark" key={i}>{i + 1}</span>
                                ))}
                            </span>
                        </div>
                    ),
                })),
                {
                    key: 'foot',
                    node: (
                        <div className="pr-foot">
                            <span>{session.title} · 답안지</span>
                            <span>총 {allQuestions.length}문항</span>
                        </div>
                    ),
                },
            ];
            return [blocks];
        }

        // 정답 및 해설
        const blocks: Block[] = [
            { key: 'head', node: header(false) },
            { key: 'kt', node: <div className="pr-block-title">정답표</div> },
            {
                key: 'table',
                node: (
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
                ),
            },
            { key: 'et', node: <div className="pr-block-title">해설</div> },
            ...allQuestions.map(q => ({
                key: `exp-${q.no}`,
                node: (
                    <div className="pr-exp">
                        <div className="pr-exp-head">
                            {q.no}. 정답 {CIRCLED[q.answer - 1] ?? q.answer}
                            <span className="pr-exp-tag">{q.category}</span>
                        </div>
                        <div className="pr-exp-body">{q.rationale || '해설이 등록되지 않은 문항입니다.'}</div>
                    </div>
                ),
            })),
            {
                key: 'foot',
                node: (
                    <div className="pr-foot">
                        <span>{session.title} · 정답 및 해설</span>
                        <span>교사용 — 학생 배포 금지</span>
                    </div>
                ),
            },
        ];
        return [blocks];
    }, [mode, cols, sections, session, allQuestions, timeLimit]);

    const flatBlocks = useMemo(() => groups.flat(), [groups]);

    // 숨긴 영역에서 실제 렌더 높이를 잰다. 단 폭이 바뀌면 다시 잰다.
    useLayoutEffect(() => {
        setHeights(null);
    }, [mode, cols, assets.length]);

    useLayoutEffect(() => {
        if (heights !== null || flatBlocks.length === 0) return;
        const el = measureRef.current;
        if (!el) return;
        const map = new Map<string, number>();
        el.querySelectorAll<HTMLElement>('[data-block]').forEach(node => {
            const key = node.dataset.block!;
            map.set(key, node.getBoundingClientRect().height / 96 * 25.4); // px → mm
        });
        if (map.size > 0) setHeights(map);
    });

    const pages = useMemo(() => {
        if (!heights) return null;
        return paginate(groups, cols, COL_HEIGHT_MM, heights);
    }, [heights, groups, cols]);

    // 한 블록이 단 하나보다 큰 경우 (지문이 지나치게 길 때) 알린다
    const oversized = useMemo(() => {
        if (!heights) return [];
        return flatBlocks
            .filter(b => (heights.get(b.key) ?? 0) > COL_HEIGHT_MM)
            .map(b => b.key);
    }, [heights, flatBlocks]);

    const nodeByKey = useMemo(() => {
        const m = new Map<string, React.ReactNode>();
        flatBlocks.forEach(b => m.set(b.key, b.node));
        return m;
    }, [flatBlocks]);

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

    return (
        <div className="print-root">
            <div className="pr-toolbar no-print">
                <button className="pr-tab" onClick={() => navigate(-1)}>← 돌아가기</button>
                <button className={`pr-tab ${mode === 'paper' ? 'active' : ''}`} onClick={() => setMode('paper')}>문제지</button>
                <button className={`pr-tab ${mode === 'answer' ? 'active' : ''}`} onClick={() => setMode('answer')}>답안지</button>
                <button className={`pr-tab ${mode === 'key' ? 'active' : ''}`} onClick={() => setMode('key')}>정답·해설</button>
                <span className="pr-divider" />
                <button className={`pr-tab ${cols === 1 ? 'active' : ''}`} onClick={() => setCols(1)}>1단</button>
                <button className={`pr-tab ${cols === 2 ? 'active' : ''}`} onClick={() => setCols(2)}>2단</button>
                <span className="pr-hint">
                    {pages ? `${pages.length}쪽` : '쪽 계산 중...'} · 인쇄 시 용지 A4 · 배율 100% · 여백 '기본'
                </span>
                <button className="pr-print-btn" onClick={() => window.print()}>인쇄 / PDF 저장</button>
            </div>

            {oversized.length > 0 && (
                <div className="pr-warn no-print">
                    ⚠️ 한 단에 담기지 않는 내용이 {oversized.length}개 있습니다.
                    {cols === 2 ? ' 1단으로 바꾸거나' : ''} 해당 지문을 줄여주세요.
                </div>
            )}

            {/* 높이 측정용 (화면에 보이지 않음) */}
            {heights === null && (
                <div className="pr-measure" ref={measureRef} aria-hidden>
                    <div className={`pr-cols ${cols === 2 ? 'two' : ''}`}>
                        <div className="pr-col">
                            {flatBlocks.map(b => (
                                <div data-block={b.key} key={b.key}>{b.node}</div>
                            ))}
                        </div>
                        {cols === 2 && <div className="pr-col" />}
                    </div>
                </div>
            )}

            {/* 실제 쪽 */}
            {pages?.map((page, pi) => (
                <div className="sheet" key={pi}>
                    <div className={`pr-cols ${cols === 2 ? 'two' : ''}`}>
                        {Array.from({ length: cols }).map((_, ci) => (
                            <div className="pr-col" key={ci}>
                                {(page[ci] || []).map(k => (
                                    <React.Fragment key={k}>{nodeByKey.get(k)}</React.Fragment>
                                ))}
                            </div>
                        ))}
                    </div>
                    <div className="pr-page-no">{pi + 1} / {pages.length}</div>
                </div>
            ))}
        </div>
    );
};

export default PrintView;
