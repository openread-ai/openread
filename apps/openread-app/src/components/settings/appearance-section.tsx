'use client';

import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Label } from '@/components/primitives/label';
import { MdOutlineLightMode, MdOutlineDarkMode } from 'react-icons/md';
import { TbSunMoon } from 'react-icons/tb';
import { themes } from '@/styles/themes';
import { ThemeMode } from '@/styles/themes';

const themeModes: {
  value: ThemeMode;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'light', labelKey: 'Light', Icon: MdOutlineLightMode },
  { value: 'dark', labelKey: 'Dark', Icon: MdOutlineDarkMode },
  { value: 'auto', labelKey: 'System', Icon: TbSunMoon },
];

export function AppearanceSection() {
  const _ = useTranslation();
  const { themeMode, themeColor, isDarkMode, setThemeMode, setThemeColor } = useThemeStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{_('Appearance')}</CardTitle>
        <CardDescription>{_('Customize how OpenRead looks')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Theme Mode Selection */}
        <div className='space-y-3'>
          <Label>{_('Theme Mode')}</Label>
          <div className='grid grid-cols-3 gap-4'>
            {themeModes.map((mode) => {
              const Icon = mode.Icon;
              const isActive = themeMode === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() => setThemeMode(mode.value)}
                  className={`hover:bg-base-200 flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                    isActive ? 'border-primary bg-primary/5' : 'border-base-300'
                  }`}
                >
                  <Icon className='h-6 w-6' />
                  <span className='text-sm'>{_(mode.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Theme Color Selection */}
        <div className='space-y-3'>
          <Label>{_('Theme Color')}</Label>
          <div className='grid grid-cols-4 gap-3 sm:grid-cols-6'>
            {themes.map((theme) => {
              const isActive = themeColor === theme.name;
              const bgColor = isDarkMode
                ? theme.colors.dark['base-100']
                : theme.colors.light['base-100'];
              const textColor = isDarkMode
                ? theme.colors.dark['base-content']
                : theme.colors.light['base-content'];

              return (
                <button
                  key={theme.name}
                  onClick={() => setThemeColor(theme.name)}
                  className={`relative flex h-12 cursor-pointer items-center justify-center rounded-lg border transition-all ${
                    isActive ? 'ring-primary ring-2 ring-offset-2' : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                    borderColor: bgColor,
                  }}
                  title={_(theme.label)}
                >
                  <span className='text-xs font-medium'>{_(theme.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
