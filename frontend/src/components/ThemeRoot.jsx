import { useLayoutEffect } from 'react';
import { ConfigProvider, App as AntApp, theme as antdTheme } from 'antd';
import viVN from 'antd/locale/vi_VN';
import AppRouter from '../router/AppRouter';
import { useThemeStore } from '../store/theme.store';

export default function ThemeRoot() {
  const mode = useThemeStore((state) => state.mode);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const isDark = mode === 'dark';
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#A89CFF' : '#5145D5',
          colorSuccess: isDark ? '#52D6A3' : '#07845E',
          colorWarning: isDark ? '#F8C46C' : '#B86B11',
          colorError: isDark ? '#FF8190' : '#D83A52',
          colorInfo: isDark ? '#81B8FF' : '#346BDF',
          colorBgBase: isDark ? '#111A2B' : '#FFFFFF',
          colorTextBase: isDark ? '#E9EDF7' : '#172033',
          colorBorder: isDark ? '#33435D' : '#DCE3EF',
          borderRadius: 10,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
        },
        components: {
          Button: { borderRadius: 9 },
          Card: { borderRadius: 14 },
          Table: {
            headerBg: isDark ? '#1B2940' : '#F2F5FB',
            headerColor: isDark ? '#BBC8DA' : '#536176',
          },
        },
      }}
    >
      <AntApp><AppRouter /></AntApp>
    </ConfigProvider>
  );
}
