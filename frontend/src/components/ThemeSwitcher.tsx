import { useEffect, useState } from 'react';
import styles from './ThemeSwitcher.module.css';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const syncTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null;
      if (currentTheme) {
        setTheme(currentTheme);
      }
    };

    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 'light';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);

    window.addEventListener('theme-change', syncTheme);
    return () => window.removeEventListener('theme-change', syncTheme);
  }, []);

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    window.dispatchEvent(new Event('theme-change'));
  };

  return (
    <button
      type="button"
      className={styles.switcher}
      onClick={toggleTheme}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#FFD700' }}>
          {/* Sun icon */}
          <circle cx="12" cy="12" r="5" fill="currentColor" />
          <path
            d="M12 2V4M12 20V22M4 12H2M22 12H20M4.929 4.929L6.343 6.343M17.657 17.657L19.071 19.071M4.929 19.071L6.343 17.657M17.657 6.343L19.071 4.929"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#3B82F6' }}>
          {/* Moon icon */}
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
