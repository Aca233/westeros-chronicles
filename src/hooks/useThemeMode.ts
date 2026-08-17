import { useEffect, useState } from 'react';

export type ThemeMode = 'day' | 'night';

function readTheme(): ThemeMode {
  return document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
}

/** 订阅 <html data-theme> 的昼夜主题,切换时触发重渲染 */
export function useThemeMode(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
