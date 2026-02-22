'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
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

  const [defaultFont, setDefaultFont] = useState(viewSettings?.defaultFont ?? 'Serif');
  const [fontSize, setFontSize] = useState(viewSettings?.defaultFontSize ?? 16);
  const [lineHeight, setLineHeight] = useState(viewSettings?.lineHeight ?? 1.5);

  const saveViewSetting = useCallback(
    <K extends keyof NonNullable<typeof viewSettings>>(
      key: K,
      value: NonNullable<typeof viewSettings>[K],
    ) => {
      if (!settings || !viewSettings) return;
      const newViewSettings = { ...viewSettings, [key]: value };
      const newSettings = { ...settings, globalViewSettings: newViewSettings };
      setSettings(newSettings);
      saveSettings(envConfig, newSettings);
    },
    [settings, viewSettings, envConfig, setSettings, saveSettings],
  );

  useEffect(() => {
    if (viewSettings && defaultFont !== viewSettings.defaultFont) {
      saveViewSetting('defaultFont', defaultFont);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFont]);

  useEffect(() => {
    if (viewSettings && fontSize !== viewSettings.defaultFontSize) {
      saveViewSetting('defaultFontSize', fontSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize]);

  useEffect(() => {
    if (viewSettings && lineHeight !== viewSettings.lineHeight) {
      saveViewSetting('lineHeight', lineHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineHeight]);

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
          <Select value={defaultFont} onValueChange={setDefaultFont}>
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
                onChange={setFontSize}
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
                onChange={setLineHeight}
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
