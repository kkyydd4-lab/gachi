
// @ts-ignore
const gapi = window.gapi;
// @ts-ignore
const google = window.google;

// 기본값 (데모용) - 사용자의 환경(Origin)이 다를 경우 작동하지 않을 수 있음
const DEFAULT_CLIENT_ID = '584098238766-o2sa7hh85t4oi909q5tkcutk1hepp7rl.apps.googleusercontent.com';
const DEFAULT_API_KEY = 'AIzaSyDNtFonTG3WLxyFhz1hvIBPCpT7IfuMErM';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DB_FILE_NAME = 'gachi_in_db.json';

// 로컬 스토리지 키
const STORAGE_KEY_CLIENT_ID = 'gachi_in_client_id';
const STORAGE_KEY_API_KEY = 'gachi_in_api_key';

export interface DriveData {
  users: any[];
  assets: any[];
  config: any;
  lastUpdated: string;
}

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const DriveClient = {
  // 현재 저장된 자격 증명 가져오기
  getClientId() {
    return localStorage.getItem(STORAGE_KEY_CLIENT_ID) || DEFAULT_CLIENT_ID;
  },

  getApiKey() {
    return localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY;
  },

  // 자격 증명 업데이트
  setCredentials(clientId: string, apiKey: string) {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId);
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
    // 재초기화를 위해 상태 리셋
    gapiInited = false;
    gisInited = false;
    tokenClient = null;
  },

  isConfigured() {
    const cid = this.getClientId();
    return cid && cid.length > 0;
  },

  async init() {
    return new Promise<void>((resolve, reject) => {
      if (!this.isConfigured()) {
        console.warn('Google Drive Client ID not configured.');
        resolve();
        return;
      }

      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            apiKey: this.getApiKey(), // Dynamic API Key
          });

          await new Promise((resolveLoad, rejectLoad) => {
            try {
              gapi.client.load('drive', 'v3', () => {
                resolveLoad(true);
              });
            } catch (e) {
              rejectLoad(e);
            }
          });

          gapiInited = true;
          this.maybeResolve(resolve);
        } catch (err) {
          console.error("GAPI Init Error:", err);
          resolve(); 
        }
      });

      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: this.getClientId(), // Dynamic Client ID
          scope: SCOPES,
          callback: '', 
        });
        gisInited = true;
        this.maybeResolve(resolve);
      } catch (err) {
         console.error("GIS Init Error:", err);
         resolve();
      }
    });
  },

  maybeResolve(resolve: () => void) {
    if (gapiInited && gisInited) resolve();
  },

  async signIn(): Promise<boolean> {
    if (!this.isConfigured()) {
        alert("API 설정을 확인해주세요.");
        return false;
    }

    if (!tokenClient) {
        // 토큰 클라이언트가 없으면 다시 초기화 시도
        await this.init();
        if (!tokenClient) {
            console.error("Token Client not initialized");
            alert("Google 인증 초기화 실패. 페이지를 새로고침하거나 API 설정을 확인하세요.");
            return false;
        }
    }

    return new Promise((resolve, reject) => {
      tokenClient.callback = async (resp: any) => {
        if (resp.error) {
          console.error("Auth Error:", resp);
          
          if (resp.error === 'access_denied') {
             alert(
               "Google 인증이 거부되었습니다.\n\n" +
               "테스트 앱의 경우 'Google에서 확인하지 않은 앱' 화면이 뜰 수 있습니다.\n" +
               "이 경우 [고급] -> [이동(안전하지 않음)]을 클릭하여 진행해주세요."
             );
          } else if (resp.error === 'invalid_request') {
             alert(
                 "잘못된 요청(invalid_request)입니다.\n\n" +
                 "현재 도메인(URL)이 Google Cloud Console의 '승인된 자바스크립트 원본'에 등록되지 않았을 가능성이 높습니다.\n" +
                 "관리자 화면 우측 상단의 [설정] 버튼을 눌러 올바른 Client ID를 입력해주세요."
             );
          }
          
          resolve(false);
          return;
        }
        resolve(true);
      };

      const currentToken = gapi.client.getToken();
      if (currentToken === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        tokenClient.requestAccessToken({ prompt: '' });
      }
    });
  },

  async findDbFile(): Promise<string | null> {
    try {
      const response = await gapi.client.drive.files.list({
        q: `name = '${DB_FILE_NAME}' and trashed = false`,
        fields: 'files(id, name)',
      });
      const files = response.result.files;
      if (files && files.length > 0) {
        return files[0].id;
      }
      return null;
    } catch (e) {
      console.error('Error finding file', e);
      return null;
    }
  },

  async readDbFile(fileId: string): Promise<DriveData | null> {
    try {
      const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });
      return response.result as DriveData;
    } catch (e) {
      console.error('Error reading file', e);
      return null;
    }
  },

  async createDbFile(initialData: DriveData): Promise<string> {
    const fileContent = JSON.stringify(initialData);
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
      name: DB_FILE_NAME,
      mimeType: 'application/json',
    };

    const accessToken = gapi.client.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form,
    });
    const val = await res.json();
    return val.id;
  },

  async updateDbFile(fileId: string, data: DriveData): Promise<void> {
    const fileContent = JSON.stringify(data);
    const accessToken = gapi.client.getToken().access_token;
    
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: new Headers({ 
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      }),
      body: fileContent,
    });
    
    if (!res.ok) throw new Error('Update failed');
  }
};
