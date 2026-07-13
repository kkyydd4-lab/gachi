// 손글씨 사진 클라이언트 압축
// - Vercel 함수 요청 본문 한도(약 4.5MB)와 Firebase Storage 용량을 고려해
//   업로드 전 브라우저에서 리사이즈+JPEG 압축한다 (5장 합계 ~1.5MB 목표)
export interface CompressedImage {
    blob: Blob;
    dataUrl: string;     // 미리보기용
    base64: string;      // API 전송용 (data: 접두사 제거)
    mediaType: string;
}

// 손글씨(특히 연필) 판독은 해상도가 곧 정확도. 1280px에선 글자가 뭉개져 판독이 크게 떨어졌음.
// 페이지당 1장씩 개별 전송하므로 2000px로 올려도 요청 본문 한도에 여유가 있음.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

export async function compressImage(file: File): Promise<CompressedImage> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('압축에 실패했습니다.'))), 'image/jpeg', JPEG_QUALITY);
    });

    const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('이미지 읽기에 실패했습니다.'));
        reader.readAsDataURL(blob);
    });

    return {
        blob,
        dataUrl,
        base64: dataUrl.split(',')[1],
        mediaType: 'image/jpeg',
    };
}
