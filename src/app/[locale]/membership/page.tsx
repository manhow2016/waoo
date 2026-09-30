'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import Navbar from '@/components/Navbar';
import { AppIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-fetch';
import { useRouter } from '@/i18n/navigation';
import { useMembershipStatus } from '@/hooks/common/useMembershipStatus';
import { BenefitsTable } from './components/BenefitsTable';
import { OrderList } from './components/OrderList';
import { PendingOrderPanel } from './components/PendingOrderPanel';
import { PlanCard } from './components/PlanCard';
import {
  computeSavePercent,
  resolvePlanNameKey,
  type MembershipOrder,
  type MembershipPlan,
  type PaymentIntent,
} from './membership-display';

const FREE_PLAN_CODE = 'free';

export default function MembershipPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('membership');
  const tc = useTranslations('common');

  const membership = useMembershipStatus();
  const reloadMembership = membership.reload;

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [orders, setOrders] = useState<MembershipOrder[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataFailed, setDataFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const [subscribeFailed, setSubscribeFailed] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PaymentIntent | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session) {
      router.push({ pathname: '/auth/signin' });
    }
  }, [router, session, sessionStatus]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      setLoadingData(true);
      setDataFailed(false);
      try {
        const [plansRes, ordersRes] = await Promise.all([
          apiFetch('/api/membership/plans'),
          apiFetch('/api/membership/orders'),
        ]);
        if (!plansRes.ok || !ordersRes.ok) {
          throw new Error(
            `membership data load failed: plans=${plansRes.status} orders=${ordersRes.status}`,
          );
        }
        const plansPayload = (await plansRes.json()) as { plans?: MembershipPlan[] };
        const ordersPayload = (await ordersRes.json()) as { orders?: MembershipOrder[] };
        if (cancelled) return;
        setPlans(Array.isArray(plansPayload.plans) ? plansPayload.plans : []);
        setOrders(Array.isArray(ordersPayload.orders) ? ordersPayload.orders : []);
        setLoadingData(false);
      } catch {
        if (cancelled) return;
        setDataFailed(true);
        setLoadingData(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, reloadToken]);

  const handleSubscribe = useCallback(
    async (planCode: string) => {
      setSubscribingPlan(planCode);
      setSubscribeFailed(false);
      try {
        const res = await apiFetch('/api/membership/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planCode }),
        });
        if (!res.ok) {
          throw new Error(`membership subscribe failed: HTTP ${res.status}`);
        }
        const payload = (await res.json()) as {
          order?: MembershipOrder;
          payment?: PaymentIntent;
        };
        const order = payload.order;
        if (order) {
          setOrders((prev) => [
            order,
            ...prev.filter((item) => item.orderNo !== order.orderNo),
          ]);
          setPendingPayment(payload.payment ?? null);
        }
        // 渠道支持自动开通时，会员立即生效，需要刷新状态
        if (order?.status === 'active') {
          reloadMembership();
        }
      } catch {
        setSubscribeFailed(true);
      } finally {
        setSubscribingPlan(null);
      }
    },
    [reloadMembership],
  );

  const handleCancelOrder = useCallback(
    async (orderNo: string) => {
      setCancellingOrder(true)
      setCancelFailed(false)
      try {
        const res = await apiFetch(
          `/api/membership/orders/${encodeURIComponent(orderNo)}/cancel`,
          { method: 'POST' },
        )
        if (!res.ok) throw new Error(`cancel failed: HTTP ${res.status}`)
        // 订单作废后从「待支付」列表中移除，历史列表仍保留该记录
        setOrders((prev) =>
          prev.map((item) =>
            item.orderNo === orderNo ? { ...item, status: 'cancelled' } : item,
          ),
        )
        setPendingPayment(null)
      } catch {
        setCancelFailed(true)
      } finally {
        setCancellingOrder(false)
      }
    },
    [],
  );

  if (sessionStatus === 'loading' || !session) {
    return (
      <div className='glass-page flex min-h-screen items-center justify-center'>
        <div className='text-[var(--glass-text-secondary)]'>{tc('loading')}</div>
      </div>
    );
  }

  const loading = membership.loading || loadingData;
  const failed = membership.failed || dataFailed;
  const pendingOrder = orders.find((order) => order.status === 'pending') ?? null;

  const reloadAll = () => {
    reloadMembership();
    setReloadToken((token) => token + 1);
  };

  const planNameKey = membership.planCode ? resolvePlanNameKey(membership.planCode) : null;
  const currentLevelLabel = membership.isActive
    ? (planNameKey ? t(planNameKey) : membership.planCode || t('planFreeName'))
    : t('planFreeName');

  const expireLabel = membership.expireAt
    ? new Date(membership.expireAt).toLocaleDateString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : t('noExpire');

  return (
    <div className='glass-page min-h-screen'>
      <Navbar />

      <main className='mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10'>
        <header className='mb-8'>
          <h1 className='text-2xl font-semibold tracking-tight text-[var(--glass-text-primary)]'>
            {t('title')}
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-[var(--glass-text-secondary)]'>
            {t('subtitle')}
          </p>
        </header>

        {loading ? (
          <MembershipSkeleton />
        ) : failed ? (
          <section className='glass-surface rounded-2xl p-6'>
            <div className='flex items-start gap-3'>
              <AppIcon
                name='alert'
                className='mt-0.5 h-5 w-5 shrink-0 text-[var(--glass-tone-warning-fg)]'
              />
              <div className='min-w-0'>
                <h2 className='text-base font-semibold text-[var(--glass-text-primary)]'>
                  {t('loadFailedTitle')}
                </h2>
                <p className='mt-1 text-sm leading-6 text-[var(--glass-text-secondary)]'>
                  {t('loadFailedDesc')}
                </p>
                <button
                  type='button'
                  onClick={reloadAll}
                  className='glass-btn-base glass-btn-primary mt-4 px-4 py-2 text-sm font-medium'
                >
                  {t('retry')}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className='glass-surface rounded-2xl p-5'>
              <h2 className='text-sm font-semibold text-[var(--glass-text-secondary)]'>
                {t('statusTitle')}
              </h2>
              <div className='mt-3 flex flex-wrap items-end gap-x-10 gap-y-4'>
                <div>
                  <p className='text-xs text-[var(--glass-text-tertiary)]'>
                    {t('currentLevel')}
                  </p>
                  <p className='mt-1 text-xl font-semibold text-[var(--glass-text-primary)]'>
                    {currentLevelLabel}
                  </p>
                </div>
                <div>
                  <p className='text-xs text-[var(--glass-text-tertiary)]'>
                    {t('expireAtLabel')}
                  </p>
                  <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>
                    {expireLabel}
                  </p>
                </div>
                {membership.isActive && membership.daysRemaining !== null && (
                  <div>
                    <p className='text-xs text-[var(--glass-text-tertiary)]'>
                      {t('daysRemainingLabel', { days: membership.daysRemaining })}
                    </p>
                    <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>
                      {membership.expiringSoon ? t('renewReminderTitle') : '—'}
                    </p>
                  </div>
                )}
              </div>
              <p className='mt-4 text-xs leading-5 text-[var(--glass-text-tertiary)]'>
                {membership.isActive ? t('paidHint') : t('freeHint')}
              </p>

              {membership.expiringSoon && (
                <div className='mt-4 rounded-xl bg-[var(--glass-tone-warning-bg)] px-4 py-3'>
                  <p className='text-sm font-medium text-[var(--glass-tone-warning-fg)]'>
                    {t('renewReminderTitle')}
                  </p>
                  <p className='mt-1 text-xs leading-5 text-[var(--glass-tone-warning-fg)]'>
                    {t('renewReminderBody')}
                  </p>
                  <a
                    href='#plans'
                    className='glass-btn-base glass-btn-primary mt-3 inline-flex px-3 py-1.5 text-xs font-medium'
                  >
                    {t('renewNow')}
                  </a>
                </div>
              )}
            </section>

            {pendingOrder && (
              <div className='mt-6'>
                <PendingOrderPanel
                  order={pendingOrder}
                  payment={pendingPayment}
                  onCancelOrder={handleCancelOrder}
                  cancelling={cancellingOrder}
                  cancelError={cancelFailed ? t('cancelOrderFailed') : null}
                />
              </div>
            )}

            <section id='plans' className='mt-10 scroll-mt-20'>
              <h2 className='text-lg font-semibold text-[var(--glass-text-primary)]'>
                {t('plansTitle')}
              </h2>
              <p className='mt-1 text-sm leading-6 text-[var(--glass-text-secondary)]'>
                {t('plansSubtitle')}
              </p>

              {plans.length === 0 ? (
                <div className='glass-surface mt-4 rounded-2xl p-8 text-center'>
                  <AppIcon
                    name='package'
                    className='mx-auto h-6 w-6 text-[var(--glass-text-tertiary)]'
                  />
                  <h3 className='mt-3 text-base font-semibold text-[var(--glass-text-primary)]'>
                    {t('emptyPlansTitle')}
                  </h3>
                  <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>
                    {t('emptyPlansDesc')}
                  </p>
                </div>
              ) : (
                <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.code}
                      plan={plan}
                      savePercent={computeSavePercent(plan, plans)}
                      isCurrent={
                        membership.isActive
                          ? plan.code === membership.planCode
                          : plan.code === FREE_PLAN_CODE
                      }
                      purchasable={plan.code !== FREE_PLAN_CODE}
                      disabledReason={t('freePlanNotPurchasable')}
                      subscribing={subscribingPlan === plan.code}
                      onSubscribe={handleSubscribe}
                    />
                  ))}
                </div>
              )}

              {subscribeFailed && (
                <p className='mt-4 text-sm leading-6 text-[var(--glass-tone-danger-fg)]'>
                  {t('subscribeFailed')}
                </p>
              )}
            </section>

            <BenefitsTable />

            <OrderList orders={orders} />
          </>
        )}
      </main>
    </div>
  );
}

function MembershipSkeleton() {
  return (
    <div className='space-y-6' aria-hidden='true'>
      <div className='glass-surface h-32 animate-pulse rounded-2xl' />
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className='glass-surface h-72 animate-pulse rounded-2xl' />
        ))}
      </div>
    </div>
  );
}
