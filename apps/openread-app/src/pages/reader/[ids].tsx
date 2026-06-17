import { useRouter } from 'next/router';
import Reader from '@/app/reader/components/Reader';

// For output:'export', dynamic routes need at least one path to generate a shell page.
export async function getStaticPaths() {
  return { paths: [{ params: { ids: '_placeholder' } }], fallback: 'blocking' };
}

export async function getStaticProps() {
  return { props: {} };
}

export default function Page() {
  const router = useRouter();
  const ids = router.query['ids'] as string;
  return <Reader ids={ids} />;
}
