'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/Navbar';
import { AppIcon } from '@/components/ui/icons';
import ImageGenerationWorkbench from '@/components/image-studio/ImageGenerationWorkbench';
import CanvasWorkspace from '@/components/image-studio/CanvasWorkspace';
import ReversePromptForm from '@/components/image-studio/ReversePromptForm';
import GifGenerationWorkspace from '@/components/image-studio/GifGenerationWorkspace';
import { cx } from '@/components/image-studio/ui';

type StudioTab = 'workbench' | 'canvas' | 'reversePrompt' | 'gif';

const TAB_DEFS: Array<{ key: StudioTab; icon: string }> = [
  { key: 'workbench', icon: 'sparkles' },
  { key: 'canvas', icon: 'image' },
  { key: 'reversePrompt', icon: 'undo' },
  { key: 'gif', icon: 'play' },
];

const VALID_TABS = new Set<string>(TAB_DEFS.map((def) => def.key));

function normalizeTab(value: string | null): StudioTab {
  return value && VALID_TABS.has(value) ? (value as StudioTab) : 'workbench';
}

function readTabParam(searchParams: URLSearchParams | null): StudioTab {
  return normalizeTab(searchParams?.get('tab') ?? null);
}

export default function ImageStudioPage() {
  const t = useTranslations('imageStudio');
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<StudioTab>(() => readTabParam(searchParams));

  useEffect(() => {
    setTab(readTabParam(searchParams));
  }, [searchParams]);

  const handleTabChange = (key: StudioTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    window.history.replaceState(null, '', url);
  };

  return (
    <div className='glass-page min-h-screen'>
      <Navbar />
      <main className='max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-8'>
        {/*} <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--glass-text-primary)] mb-2">{t('title')}</h1>
            <p className="text-[var(--glass-text-secondary)]">{t('subtitle')}</p>
          </div>
        </div>*/}

        {/* Tab 导航 */}
        <div className='mb-6 inline-flex rounded-2xl p-1 bg-[var(--glass-bg-muted)] gap-1'>
          {TAB_DEFS.map((def) => {
            const active = tab === def.key;
            return (
              <button
                key={def.key}
                type='button'
                onClick={() => handleTabChange(def.key)}
                className={cx(
                  'px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all',
                  active
                    ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                    : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]',
                )}
              >
                <AppIcon name={def.icon as never} className='w-4 h-4' />
                {t(`tabs.${def.key}`)}
              </button>
            );
          })}
        </div>

        {/* 功能面板 */}
        <div className='glass-surface rounded-2xl p-6'>
          {tab === 'workbench' && <ImageGenerationWorkbench />}
          {tab === 'canvas' && <CanvasWorkspace />}
          {tab === 'reversePrompt' && <ReversePromptForm />}
          {tab === 'gif' && <GifGenerationWorkspace />}
        </div>
      </main>
    </div>
  );
}
