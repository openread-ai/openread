import Link from 'next/link';

export function LegalPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='bg-base-100 min-h-screen'>
      <div className='mx-auto max-w-4xl px-6 py-12'>
        <div className='mb-8'>
          <Link href='/' className='text-primary hover:underline'>
            &larr; Back to Home
          </Link>
        </div>

        <article className='prose prose-sm sm:prose lg:prose-lg max-w-none'>{children}</article>
      </div>
    </div>
  );
}
