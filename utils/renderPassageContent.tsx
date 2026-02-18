import React from 'react';

/**
 * 지문 콘텐츠에서 마커(㉠, ㉡), 밑줄([밑줄:...]), 빈칸 등을 
 * 시각적으로 렌더링하는 공유 유틸리티
 */
export const renderPassageContent = (content: string): React.ReactNode[] => {
    // 정규식: [밑줄:...], [문장밑줄:...], [빈칸], 원문자 마커, 한글 자음, 괄호 빈칸
    const pattern = /(\[밑줄:.*?\]|\[문장밑줄:.*?\]|\[빈칸\]|[㉠-㉯]|[ⓐ-ⓔ]|\(   \)|\(  [ㄱ-ㅎ]  \)|\(  [㉠-㉯]  \))/g;

    return content.split(pattern).map((part, i) => {
        if (part.startsWith('[밑줄:')) {
            const text = part.match(/\[밑줄:(.*?)\]/)?.[1];
            return (
                <u key={i} className="decoration-primary decoration-[3px] underline-offset-[6px] font-bold text-navy px-0.5 bg-primary/10 rounded-sm">
                    {text}
                </u>
            );
        } else if (part.startsWith('[문장밑줄:')) {
            const text = part.match(/\[문장밑줄:(.*?)\]/)?.[1];
            return (
                <span key={i} className="decoration-secondary decoration-2 underline underline-offset-4 bg-secondary/5 px-1 rounded mx-0.5">
                    {text}
                </span>
            );
        } else if (part === '[빈칸]' || part === '(   )') {
            return (
                <span key={i} className="inline-block px-8 py-1 border-2 border-dashed border-primary/40 rounded-xl bg-primary/5 mx-1 text-transparent select-none">
                    빈칸
                </span>
            );
        } else if (/^[㉠-㉩]$/.test(part)) {
            return (
                <span key={i} className="inline-flex items-center justify-center w-6 h-6 mx-0.5 bg-indigo-600 text-white rounded-full text-xs font-bold shadow-sm align-text-bottom">
                    {part}
                </span>
            );
        } else if (/^[ⓐ-ⓔ]$/.test(part)) {
            return (
                <span key={i} className="inline-flex items-center justify-center w-6 h-6 mx-1 bg-emerald-600 text-white rounded-full text-xs font-bold shadow-sm">
                    {part}
                </span>
            );
        } else if (/^[㉪-㉯]$/.test(part) || part.match(/\(  [ㄱ-ㅎ㉠-㉯]  \)/)) {
            return (
                <span key={i} className="inline-block px-6 py-1 border-2 border-dashed border-indigo-400 rounded-lg bg-indigo-50 mx-1 font-bold text-indigo-600">
                    {part}
                </span>
            );
        }
        return part;
    });
};
