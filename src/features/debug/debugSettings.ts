export const DEBUG_SETTING_STORAGE_KEY = 'westeros-debug';

export function readDebugEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_SETTING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(DEBUG_SETTING_STORAGE_KEY, '1');
    else localStorage.removeItem(DEBUG_SETTING_STORAGE_KEY);
  } catch {
    // 忽略隐私模式
  }
}
