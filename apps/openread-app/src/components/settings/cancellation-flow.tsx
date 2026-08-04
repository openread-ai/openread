'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { RetentionOffer } from './retention-offer';
import { PreCancelPrompt } from './pre-cancel-prompt';
import { CancelSurvey, type CancelSurveyData } from './cancel-survey';
import { CancelConfirmation } from './cancel-confirmation';
import { resolvePlanFeatureLosses } from '@openread/entitlements';
import { useTranslation } from '@/hooks/useTranslation';
import { useTierConfig } from '@/hooks/useTierConfig';
import { eventDispatcher } from '@/utils/event';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { createLogger } from '@/utils/logger';
import type { PaymentProvider } from '@/types/payment';
import type { UserPlan } from '@/types/quota';
import { getIAPManagementUrl } from '@/libs/payment/iap/client';

const logger = createLogger('cancellation-flow');

type CancelStep = 'retention' | 'survey' | 'confirm';

interface IAPPreCancelPromptProps {
  planId: UserPlan;
  planName: string;
  onKeep: () => void;
  onProceed: () => void;
}

function IAPPreCancelPrompt({ planId, planName, onKeep, onProceed }: IAPPreCancelPromptProps) {
  const { config, isLoading } = useTierConfig();
  const features = config
    ? resolvePlanFeatureLosses(planId, 'free', config).map(({ label }) => label)
    : [];
  const status = isLoading ? 'loading' : config ? 'ready' : 'unavailable';

  return (
    <PreCancelPrompt
      planName={planName}
      features={features}
      status={status}
      onKeep={onKeep}
      onProceed={onProceed}
    />
  );
}

interface CancellationFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PaymentProvider;
  planId: UserPlan;
  planName: string;
  periodEnd: Date | null;
}

export function CancellationFlow({
  open,
  onOpenChange,
  source,
  planId,
  planName,
  periodEnd,
}: CancellationFlowProps) {
  const _ = useTranslation();
  const [step, setStep] = useState<CancelStep>('retention');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStripe = source === 'stripe';

  const handleClose = () => {
    onOpenChange(false);
    // Reset step after dialog animation completes
    setTimeout(() => setStep('retention'), 300);
  };

  const handleApplyCoupon = async () => {
    setIsApplyingCoupon(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(`${getAPIBaseUrl()}/stripe/apply-retention-coupon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to apply retention coupon');
      }

      eventDispatcher.dispatch('toast', {
        type: 'success',
        message: _('20% discount applied to your next billing cycle!'),
      });
      handleClose();
    } catch (error) {
      logger.error('Failed to apply retention coupon:', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Failed to apply discount. Please try again.'),
      });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const submitSurvey = async (data: CancelSurveyData | null) => {
    try {
      const token = await getAccessToken();
      await fetch(`${getAPIBaseUrl()}/billing/cancel-survey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: data?.reason ?? 'skipped',
          feedback: data?.feedback ?? '',
          source,
        }),
      });
    } catch (error) {
      // Survey storage failure is not critical
      logger.warn('Failed to store cancel survey:', error);
    }
  };

  const handleCancelStripe = async (surveyData: CancelSurveyData | null) => {
    setIsSubmitting(true);
    try {
      await submitSurvey(surveyData);

      const token = await getAccessToken();
      const response = await fetch(`${getAPIBaseUrl()}/stripe/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: surveyData?.reason ?? 'skipped',
          feedback: surveyData?.feedback ?? '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }

      setStep('confirm');
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Failed to cancel subscription. Please try again.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelIAP = async (surveyData: CancelSurveyData | null) => {
    setIsSubmitting(true);
    try {
      await submitSurvey(surveyData);

      if (source !== 'stripe') {
        window.open(getIAPManagementUrl(source), '_blank');
      }
      setStep('confirm');
    } catch (error) {
      logger.error('Failed to process IAP cancellation:', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Something went wrong. Please try again.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (surveyData: CancelSurveyData | null) => {
    if (isStripe) {
      await handleCancelStripe(surveyData);
    } else {
      await handleCancelIAP(surveyData);
    }
  };

  const handleSurveySubmit = (data: CancelSurveyData) => {
    handleCancel(data);
  };

  const handleSurveySkip = () => {
    handleCancel(null);
  };

  const stepTitles: Record<CancelStep, string> = {
    retention: _('Before you go...'),
    survey: _('Help us improve'),
    confirm: _('Cancellation confirmed'),
  };

  const stepDescriptions: Record<CancelStep, string> = {
    retention: isStripe
      ? _('We have a special offer for you')
      : _('Please review what you will lose'),
    survey: _('Your feedback helps us build a better product'),
    confirm: _('Your subscription changes have been processed'),
  };

  return (
    <Dialog open={open} onOpenChange={step === 'confirm' ? handleClose : onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{stepTitles[step]}</DialogTitle>
          <DialogDescription>{stepDescriptions[step]}</DialogDescription>
        </DialogHeader>

        {step === 'retention' &&
          (isStripe ? (
            <RetentionOffer
              onKeep={handleApplyCoupon}
              onProceed={() => setStep('survey')}
              isApplyingCoupon={isApplyingCoupon}
            />
          ) : (
            <IAPPreCancelPrompt
              planId={planId}
              planName={planName}
              onKeep={handleClose}
              onProceed={() => setStep('survey')}
            />
          ))}

        {step === 'survey' && (
          <CancelSurvey
            onSubmit={handleSurveySubmit}
            onSkip={handleSurveySkip}
            isSubmitting={isSubmitting}
          />
        )}

        {step === 'confirm' && <CancelConfirmation endDate={periodEnd} onClose={handleClose} />}
      </DialogContent>
    </Dialog>
  );
}
