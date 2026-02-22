'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

export default function NotFound() {
  const _ = useTranslation();

  return (
    <div className='hero bg-base-200 min-h-screen'>
      <div className='hero-content text-center'>
        <div className='w-full max-w-2xl p-1'>
          <div className='mb-8 mt-6'>
            <div className='text-warning text-8xl'>404</div>
          </div>

          <h1 className='text-base-content mb-4 text-5xl font-bold'>{_('Page Not Found')}</h1>

          <p className='text-base-content/70 mb-8 text-lg'>
            {_(
              "The page you're looking for doesn't exist. It may have been moved or deleted, or you may have mistyped the URL.",
            )}
          </p>

          <div className='flex flex-col gap-4'>
            <Link href='/library' className='btn btn-primary btn-lg'>
              <svg className='mr-2 h-5 w-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
                />
              </svg>
              {_('Go to Library')}
            </Link>

            <div className='flex gap-3'>
              <Link href='/home' className='btn btn-outline flex-1'>
                <svg className='mr-2 h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
                  />
                </svg>
                {_('Home')}
              </Link>

              <Link href='/settings' className='btn btn-outline flex-1'>
                <svg className='mr-2 h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
                  />
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                  />
                </svg>
                {_('Settings')}
              </Link>
            </div>
          </div>

          <div className='border-base-300 mt-8 border-t pt-6'>
            <p className='text-base-content/60 text-sm'>
              {_('Need help?')}{' '}
              <a href='mailto:support@openread.com' className='link link-primary'>
                {_('Contact Support')}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
