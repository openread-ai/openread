import { useTranslation } from '@/hooks/useTranslation';
import Link from './Link';

const LegalLinks = () => {
  const _ = useTranslation();

  return (
    <div className='my-2 flex flex-wrap justify-center gap-4 text-sm sm:text-xs'>
      <Link href='/terms' className='text-blue-500 underline hover:text-blue-600'>
        {_('Terms of Service')}
      </Link>
      <Link href='/privacy' className='text-blue-500 underline hover:text-blue-600'>
        {_('Privacy Policy')}
      </Link>
      {/* Apple EULA shown on all platforms: Apple requires it to be accessible
         and users may access the app from multiple platforms */}
      <Link
        href='https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
        className='text-blue-500 underline hover:text-blue-600'
      >
        {_('EULA')}
      </Link>
    </div>
  );
};

export default LegalLinks;
