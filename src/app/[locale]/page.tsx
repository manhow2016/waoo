'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useRouter } from '@/i18n/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Link } from '@/i18n/navigation';
import { AppIcon } from '@/components/ui/icons';
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route';

export default function Home() {
  const t = useTranslations('landing');
  const { status } = useSession();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(buildAuthenticatedHomeTarget());
    }
  }, [status, router]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setScrolled(container.scrollTop > 80);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  if (status !== 'unauthenticated') {
    return (
      <div className='glass-page min-h-screen flex items-center justify-center'>
        <div className='flex flex-col items-center gap-4'>
          <Image
            src='/logo-small.png'
            alt='waoowaoo'
            width={80}
            height={80}
            className='animate-pulse'
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className='landing-page bg-black text-white'>
      {/* 导航栏 */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-all duration-300 ${
          scrolled
            ? 'bg-black/80 backdrop-blur-xl py-3 px-8 md:px-16 border-b border-white/10'
            : 'bg-transparent py-5 px-8 md:px-16'
        }`}
      >
        <Link href={{ pathname: '/' }} className='group'>
          <Image
            src='/logo-small.png'
            alt='waoowaoo'
            width={80}
            height={80}
            className='object-contain transition-transform group-hover:scale-110'
          />
        </Link>
        <div className='flex items-center gap-6'>
          <LanguageSwitcher />
          <Link
            href={{ pathname: '/auth/signin' }}
            className='inline-flex items-center justify-center px-7 py-2.5 bg-[#1a56db] text-white rounded-full text-sm font-semibold transition-all duration-300 hover:bg-[#1e40af] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1a56db]/35'
          >
            {t('getStarted')}
          </Link>
        </div>
      </nav>

      {/* ============================
          Hero 首屏
      ============================ */}
      <section className='landing-section relative w-full h-screen flex items-center justify-center overflow-hidden'>
        {/* 视频加载前的渐变占位背景 */}
        <div className='absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c1628]' />

        {/* 视频背景 */}
        <video
          className='hero-video'
          autoPlay
          muted
          loop
          playsInline
          preload='auto'
        >
          <source src='/landing/hero.mp4' type='video/mp4' />
        </video>

        {/* 深色渐变遮罩 */}
        <div
          className='absolute inset-0 z-[1]'
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)',
          }}
        />

        {/* 首屏内容 */}
        <div className='relative z-[2] text-center max-w-[800px] px-6'>
          <div className='inline-block px-5 py-2 bg-white/8 border border-white/15 rounded-full text-white/85 text-[0.82rem] font-medium mb-7 backdrop-blur-md tracking-wide'>
            🎬 {t('hero.badge')}
          </div>
          <h1 className='text-[clamp(2.2rem,5vw,3.8rem)] font-extrabold text-white leading-[1.2] mb-5 tracking-tight'>
            {t('hero.title')}{' '}
            <span className='gradient-text'>{t('hero.titleHighlight')}</span>
          </h1>
          <p className='text-[clamp(1rem,2vw,1.2rem)] text-white/70 mb-10 leading-[1.7] max-w-[600px] mx-auto'>
            {t('hero.subtitle')}
          </p>
          <div className='flex gap-4 justify-center flex-wrap'>
            <Link
              href={{ pathname: '/auth/signin' }}
              className='inline-flex items-center justify-center px-9 py-4 bg-[#1a56db] text-white rounded-full text-base font-semibold transition-all duration-300 hover:bg-[#1e40af] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(26,86,219,0.35)]'
            >
              {t('hero.cta')}
            </Link>
            <a
              href='#platform'
              onClick={(e) => {
                e.preventDefault();
                scrollContainerRef.current
                  ?.querySelector('#platform')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className='inline-flex items-center justify-center px-9 py-4 bg-white/12 text-white border border-white/30 rounded-full text-base font-semibold backdrop-blur-sm transition-all duration-300 hover:bg-white/20 hover:border-white/50 hover:-translate-y-0.5'
            >
              {t('hero.explore')} →
            </a>
          </div>
        </div>

        {/* 底部滚动提示箭头 */}
        <div className='absolute bottom-10 left-1/2 z-[2] flex flex-col items-center gap-2 animate-breathe'>
          <span className='text-[0.75rem] text-white/50 tracking-[2px] uppercase'>
            {t('hero.scrollDown')}
          </span>
          <AppIcon name='chevronDown' className='w-6 h-6 text-white/50' />
        </div>
      </section>

      {/* ============================
          平台展示区
      ============================ */}
      <section
        id='platform'
        className='landing-section bg-black py-20 px-8 md:px-16 flex flex-col justify-center'
      >
        <div className='text-center mb-16'>
          <h2 className='text-[clamp(1.5rem,4vw,2.625rem)] font-bold mb-4 tracking-wide'>
            {t('platform.title')}
          </h2>
          <p className='text-[clamp(0.875rem,1.5vw,1.125rem)] text-[#aaa]'>
            {t('platform.subtitle')}
          </p>
        </div>
        <div className='max-w-[1200px] mx-auto w-full flex justify-center'>
          <div className='w-full max-w-[900px] rounded-2xl overflow-hidden showcase-gradient relative min-h-[320px] md:min-h-[520px] flex items-center'>
            <Image
              className='relative z-[2] w-full h-full object-cover'
              src='/landing/platform.png'
              alt={t('platform.title')}
              width={900}
              height={520}
            />
          </div>
        </div>
      </section>

      {/* ============================
          画布创作流程区
      ============================ */}
      <section className='landing-section bg-black py-16 px-8 md:px-16 flex flex-col justify-center'>
        <div className='text-center mb-16'>
          <h2 className='text-[clamp(1.5rem,4vw,2.625rem)] font-bold mb-4 tracking-[2px]'>
            {t('canvas.title')}
          </h2>
          <p className='text-[clamp(0.875rem,1.5vw,1.125rem)] text-[#aaa]'>
            {t('canvas.subtitle')}
          </p>
        </div>

        {/* 流程图 */}
        <div className='max-w-[1200px] mx-auto w-full relative h-[480px] mb-16 hidden lg:block'>
          {/* SVG 连接线（自定义路径图形，非图标） */}
          {/* eslint-disable-next-line no-restricted-syntax */}
          <svg
            className='absolute inset-0 w-full h-full z-[1] pointer-events-none'
            viewBox='0 0 1200 480'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              d='M280 240 C 380 240, 420 80, 520 80'
              stroke='#333'
              strokeWidth='1.5'
              fill='none'
            />
            <path
              d='M280 240 C 380 240, 420 400, 520 400'
              stroke='#333'
              strokeWidth='1.5'
              fill='none'
            />
            <path
              d='M680 80 C 780 80, 820 180, 900 180'
              stroke='#333'
              strokeWidth='1.5'
              fill='none'
            />
            <path
              d='M680 400 C 780 400, 820 300, 900 300'
              stroke='#333'
              strokeWidth='1.5'
              fill='none'
            />
          </svg>

          {/* 左侧：文本生成节点 */}
          <div className='absolute left-0 top-1/2 -translate-y-1/2 z-[2] w-[280px] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.textGen')}
            </div>
            <div className='bg-[#111] rounded-md p-4 text-xs text-[#bbb] leading-[1.8] text-left w-full'>
              {t('canvas.textGenContent')}
            </div>
          </div>

          {/* 中上：人物生成节点 */}
          <div className='absolute left-1/2 top-0 -translate-x-1/2 z-[2] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.characterGen')}
            </div>
            <div className='w-[320px] rounded-xl overflow-hidden'>
              <Image
                src='/landing/character.png'
                alt={t('canvas.characterGen')}
                width={320}
                height={400}
                className='w-full h-auto object-cover'
              />
            </div>
          </div>

          {/* 中下：场景图节点 */}
          <div className='absolute left-1/2 bottom-0 -translate-x-1/2 z-[2] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.sceneGen')}
            </div>
            <div className='w-[320px] rounded-xl overflow-hidden'>
              <Image
                src='/landing/scene.png'
                alt={t('canvas.sceneGen')}
                width={320}
                height={200}
                className='w-full h-auto object-cover'
              />
            </div>
          </div>

          {/* 右侧：视频生成节点 */}
          <div className='absolute right-0 top-1/2 -translate-y-1/2 z-[2] w-[300px] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.videoGen')}
            </div>
            <div className='rounded-xl overflow-hidden border-2 border-[#333] bg-black w-full mb-3'>
              <video
                autoPlay
                muted
                loop
                playsInline
                preload='auto'
                className='w-full block object-cover'
              >
                <source src='/landing/video.mp4' type='video/mp4' />
              </video>
            </div>
            <div className='bg-[#111] rounded-md p-4 text-xs text-[#bbb] leading-[1.8] text-left w-full'>
              {t('canvas.videoContent')}
            </div>
          </div>
        </div>

        {/* 移动端竖向排列 */}
        <div className='flex flex-col gap-10 items-center lg:hidden'>
          <div className='w-full max-w-[320px] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.textGen')}
            </div>
            <div className='bg-[#111] rounded-md p-4 text-xs text-[#bbb] leading-[1.8] text-left w-full'>
              {t('canvas.textGenContent')}
            </div>
          </div>
          <div className='w-full max-w-[320px] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.characterGen')}
            </div>
            <div className='w-full rounded-xl overflow-hidden'>
              <Image
                src='/landing/character.png'
                alt={t('canvas.characterGen')}
                width={320}
                height={400}
                className='w-full h-auto object-cover'
              />
            </div>
          </div>
          <div className='w-full max-w-[320px] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.sceneGen')}
            </div>
            <div className='w-full rounded-xl overflow-hidden'>
              <Image
                src='/landing/scene.png'
                alt={t('canvas.sceneGen')}
                width={320}
                height={200}
                className='w-full h-auto object-cover'
              />
            </div>
          </div>
          <div className='w-full max-w-[320px] flex flex-col items-center'>
            <div className='text-sm text-[#aaa] mb-3'>
              {t('canvas.videoGen')}
            </div>
            <div className='rounded-xl overflow-hidden border-2 border-[#333] bg-black w-full mb-3'>
              <video
                autoPlay
                muted
                loop
                playsInline
                preload='auto'
                className='w-full block object-cover'
              >
                <source src='/landing/video.mp4' type='video/mp4' />
              </video>
            </div>
            <div className='bg-[#111] rounded-md p-4 text-xs text-[#bbb] leading-[1.8] text-left w-full'>
              {t('canvas.videoContent')}
            </div>
          </div>
        </div>

        {/* 立即体验按钮 */}
        <div className='text-center'>
          <Link
            href={{ pathname: '/auth/signin' }}
            className='inline-flex items-center gap-2 px-12 py-3 border border-white rounded-full bg-transparent text-white text-base transition-all duration-300 hover:bg-white hover:text-black'
          >
            {t('canvas.tryNow')}
            <AppIcon name='arrowRight' className='w-4 h-4' />
          </Link>
        </div>
      </section>

      {/* ============================
          页脚
      ============================ */}
      <footer className='bg-black pt-16 pb-8 px-8 md:px-16 border-t border-[#222]'>
        <div className='max-w-[1200px] mx-auto'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 pb-10 border-b border-[#222]'>
            {/* 品牌 */}
            <div>
              <div className='text-xl font-bold text-white mb-3'>waoowaoo</div>
              <p className='text-[0.85rem] text-[#888] leading-[1.7] max-w-[280px]'>
                {t('footer.description')}
              </p>
            </div>
            {/* 产品 */}
            <div>
              <h4 className='text-[0.9rem] font-semibold text-white mb-5'>
                {t('footer.product')}
              </h4>
              <ul className='flex flex-col gap-3'>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.aiImage')}
                  </a>
                </li>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.aiVideo')}
                  </a>
                </li>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.canvas')}
                  </a>
                </li>
              </ul>
            </div>
            {/* 帮助 */}
            <div>
              <h4 className='text-[0.9rem] font-semibold text-white mb-5'>
                {t('footer.help')}
              </h4>
              <ul className='flex flex-col gap-3'>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.tutorial')}
                  </a>
                </li>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.faq')}
                  </a>
                </li>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.contactUs')}
                  </a>
                </li>
              </ul>
            </div>
            {/* 关于 */}
            <div>
              <h4 className='text-[0.9rem] font-semibold text-white mb-5'>
                {t('footer.about')}
              </h4>
              <ul className='flex flex-col gap-3'>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.aboutUs')}
                  </a>
                </li>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.terms')}
                  </a>
                </li>
                <li>
                  <a
                    href='#'
                    className='text-[0.85rem] text-[#888] no-underline transition-colors hover:text-white'
                  >
                    {t('footer.privacy')}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className='max-w-[1200px] pt-6'>
            <p className='text-[0.8rem] text-[#666]'>{t('footer.copyright')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
