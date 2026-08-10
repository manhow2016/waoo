'use client';

import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from './LanguageSwitcher';
import { AppIcon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';

export default function Navbar() {
  const { data: session, status } = useSession();
  const t = useTranslations('nav');

  return (
    <nav className='glass-nav sticky top-0 z-50'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='flex justify-between items-center h-16'>
          <div className='flex items-center space-x-6 ml-auto'>
            {status === 'loading' ? (
              <div className='flex items-center space-x-4'>
                <div className='h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse' />
                <div className='h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse' />
                <div className='h-8 w-20 rounded-lg bg-[var(--glass-bg-muted)] animate-pulse' />
              </div>
            ) : session ? (
              <>
                <Link
                  href={{ pathname: '/home' }}
                  className='text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1'
                >
                  <AppIcon name='monitor' className='w-4 h-4' />
                  {t('home')}
                </Link>
                <Link
                  href={{ pathname: '/image-studio' }}
                  className='text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1'
                >
                  <AppIcon name='sparkles' className='w-4 h-4' />
                  {t('imageStudio')}
                </Link>
                <Link
                  href={{ pathname: '/workspace/asset-hub' }}
                  className='text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1'
                >
                  <AppIcon name='folderHeart' className='w-4 h-4' />
                  {t('assetHub')}
                </Link>

                <Link
                  href={{ pathname: '/profile' }}
                  className='text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1'
                  title={t('profile')}
                >
                  <AppIcon name='userRoundCog' className='w-5 h-5' />
                  {t('profile')}
                </Link>
                <LanguageSwitcher />
              </>
            ) : (
              <>
                <Link
                  href={{ pathname: '/auth/signin' }}
                  className='text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors'
                >
                  {t('signin')}
                </Link>
                <Link
                  href={{ pathname: '/auth/signup' }}
                  className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
                >
                  {t('signup')}
                </Link>
                <LanguageSwitcher />
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
