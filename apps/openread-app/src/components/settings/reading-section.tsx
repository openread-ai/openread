'use client';

import { useCallback } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import type { ViewSettings } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import NumberInput from './NumberInput';

const fontOptions = [
  { value: 'Serif', labelKey: 'Serif' },
  { value: 'Sans-serif', labelKey: 'Sans-Serif' },
];

export function ReadingSection() {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();

  const viewSettings = settings?.globalViewSettings;
  const defaultFont = viewSettings?.defaultFont ?? 'Serif';
  const fontSize = viewSettings?.defaultFontSize ?? 16;
  const lineHeight = viewSettings?.lineHeight ?? 1.5;

  const saveViewSetting = useCallback(
    <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => {
      if (!settings?.globalViewSettings) return;
      const newViewSettings = { ...settings.globalViewSettings, [key]: value };
      const newSettings = { ...settings, globalViewSettings: newViewSettings };
      setSettings(newSettings);
      saveSettings(envConfig, newSettings);
    },
    [settings, envConfig, setSettings, saveSettings],
  );

  // Get computed font family for preview
  const getPreviewFontFamily = () => {
    if (defaultFont === 'Serif') {
      return 'Georgia, serif';
    }
    return 'Inter, sans-serif';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{_('Reading')}</CardTitle>
        <CardDescription>{_('Customize your reading experience')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Font Family */}
        <div className='space-y-2'>
          <Label>{_('Default Font')}</Label>
          <Select
            value={defaultFont}
            onValueChange={(value) => saveViewSetting('defaultFont', value)}
          >
            <SelectTrigger className='bg-base-100 w-64'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className='bg-base-100'>
              {fontOptions.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  {_(font.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Font Size */}
        <div className='w-full'>
          <div className='card border-base-200 border shadow'>
            <div className='divide-base-200 divide-y'>
              <NumberInput
                label={_('Font Size')}
                value={fontSize}
                onChange={(value) => saveViewSetting('defaultFontSize', value)}
                min={12}
                max={32}
                step={1}
              />
            </div>
          </div>
        </div>

        {/* Line Height */}
        <div className='w-full'>
          <div className='card border-base-200 border shadow'>
            <div className='divide-base-200 divide-y'>
              <NumberInput
                label={_('Line Height')}
                value={lineHeight}
                onChange={(value) => saveViewSetting('lineHeight', value)}
                min={1.0}
                max={2.5}
                step={0.1}
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className='border-base-300 rounded-lg border p-4'>
          <p className='text-base-content/60 mb-2 text-sm'>{_('Preview')}</p>
          <p
            style={{
              fontFamily: getPreviewFontFamily(),
              fontSize: `${fontSize}px`,
              lineHeight: lineHeight,
            }}
          >
            {_(
              'The quick brown fox jumps over the lazy dog. This is a preview of your reading settings.',
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
