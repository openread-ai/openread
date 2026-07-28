import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { V2Wrapper } from '../V2Decorator';
import { CategoryPills } from '@/components/explore/CategoryPills';

const categories = [
  { subject_name: 'Literature & Fiction', book_count: 475 },
  { subject_name: 'History', book_count: 63 },
  { subject_name: 'Biography & Memoir', book_count: 41 },
  { subject_name: 'Philosophy & Religion', book_count: 22 },
  { subject_name: 'Travel & Leisure', book_count: 22 },
  { subject_name: 'Society & Politics', book_count: 15 },
  { subject_name: 'Science & Nature', book_count: 6 },
  { subject_name: 'Education & Reference', book_count: 5 },
  { subject_name: 'Technology & Engineering', book_count: 4 },
  { subject_name: 'Business & Economics', book_count: 2 },
  { subject_name: 'Arts & Culture', book_count: 1 },
];

function InteractivePills({ sticky }: { sticky?: boolean }) {
  const [lastSubjects, setLastSubjects] = useState<string[] | undefined>();
  return (
    <div className='space-y-4'>
      <CategoryPills categories={categories} onCategoryChange={setLastSubjects} sticky={sticky} />
      <pre className='rounded-md border border-[#D6D3CB] bg-white p-3 text-xs text-[#6B6963]'>
        {lastSubjects ? JSON.stringify(lastSubjects, null, 2) : 'undefined (All selected)'}
      </pre>
    </div>
  );
}

const meta: Meta<typeof CategoryPills> = {
  title: 'V2/Explore/CategoryPills',
  component: CategoryPills,
  decorators: [
    (Story) => (
      <V2Wrapper>
        <Story />
      </V2Wrapper>
    ),
  ],
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <InteractivePills /> };
export const Expanded: Story = { render: () => <InteractivePills /> };
export const Loading: Story = { args: { categories: [], isLoading: true } };
export const DarkMode: Story = {
  decorators: [
    (Story) => (
      <V2Wrapper dark>
        <Story />
      </V2Wrapper>
    ),
  ],
  render: () => <InteractivePills />,
};
