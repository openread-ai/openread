'use client';

import { useState, useCallback } from 'react';
import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import { RotateCcw } from 'lucide-react';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { createLogger } from '@/utils/logger';

const logger = createLogger('reset-preferences');

export function ResetPreferences() {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { setThemeMode, setThemeColor } = useThemeStore();
  const { settings, setSettings, saveSettings } = useSettingsStore();

  const [showDialog, setShowDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = useCallback(async () => {
    setIsResetting(true);
    try {
      // Reset theme settings
      setThemeMode('auto');
      setThemeColor('default');

      // Reset notification preferences in localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('notificationPreferences');
        localStorage.removeItem('openread-preferences');
      }

      // Reset AI settings and view settings
      if (settings && appService) {
        const defaultViewSettings = appService.getDefaultViewSettings();
        const newSettings = {
          ...settings,
          aiSettings: DEFAULT_AI_SETTINGS,
          telemetryEnabled: true,
          globalViewSettings: {
            ...settings.globalViewSettings,
            defaultFont: defaultViewSettings.defaultFont,
            defaultFontSize: defaultViewSettings.defaultFontSize,
            lineHeight: defaultViewSettings.lineHeight,
          },
        };
        setSettings(newSettings);
        await saveSettings(envConfig, newSettings);
      }

      setShowDialog(false);
    } catch (error) {
      logger.error('Failed to reset preferences:', error);
    } finally {
      setIsResetting(false);
    }
  }, [settings, envConfig, appService, setSettings, saveSettings, setThemeMode, setThemeColor]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{_('Reset Preferences')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-base-content/60 mb-4 text-sm'>
            {_('Reset all preferences to their default values. This cannot be undone.')}
          </p>
          <Button variant='outline' onClick={() => setShowDialog(true)}>
            <RotateCcw className='mr-2 h-4 w-4' aria-hidden='true' />
            {_('Reset to Defaults')}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{_('Reset Preferences?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {_(
                'This will reset all your preferences to their default values. Your books and reading progress will not be affected.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>{_('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={isResetting}>
              {isResetting ? _('Resetting...') : _('Reset')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
