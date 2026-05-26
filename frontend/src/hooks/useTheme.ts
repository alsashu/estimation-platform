import { useEffect } from 'react';
import { useThemeStore } from '../store';

export function useTheme() {
  const { theme, setTheme, toggleTheme } = useThemeStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}
