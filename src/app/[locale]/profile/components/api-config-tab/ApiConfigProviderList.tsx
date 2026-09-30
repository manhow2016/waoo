'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CustomModel, Provider } from '../api-config';
import { ProviderCard } from '../api-config';
import { LockedProviderCard } from './LockedProviderCard';
import { ApiConfigPageHeader } from './ApiConfigPageHeader';
import { AppIcon } from '@/components/ui/icons';

interface DefaultModels {
  analysisModel?: string;
  characterModel?: string;
  locationModel?: string;
  storyboardModel?: string;
  editModel?: string;
  videoModel?: string;
  audioModel?: string;
  lipSyncModel?: string;
}

interface ApiConfigProviderListProps {
  modelProviders: Provider[];
  allModels: CustomModel[];
  defaultModels: DefaultModels;
  getModelsForProvider: (providerId: string) => CustomModel[];
  onAddGeminiProvider: () => void;
  onToggleModel: (modelKey: string, providerId: string) => void;
  onUpdateApiKey: (providerId: string, apiKey: string) => void;
  onUpdateBaseUrl: (providerId: string, baseUrl: string) => void;
  onReorderProviders: (
    activeProviderId: string,
    overProviderId: string,
  ) => void;
  onDeleteModel: (modelKey: string, providerId: string) => void;
  onUpdateModel: (
    modelKey: string,
    updates: Partial<CustomModel>,
    providerId: string,
  ) => void;
  onDeleteProvider: (providerId: string) => void;
  onAddModel: (model: Omit<CustomModel, 'enabled'>) => void;
  onFlushConfig: () => Promise<void>;
  onToggleProviderHidden: (providerId: string, hidden: boolean) => void;
  /** 会员准入：判断某供应商是否被当前等级锁定（服务端返回的策略） */
  isProviderLocked: (providerId: string) => boolean;
  labels: {
    providerPool: string;
    providerPoolDesc: string;
    dragToSort: string;
    dragToSortHint: string;
    hideProvider: string;
    showProvider: string;
    showHiddenProviders: string;
    hideHiddenProviders: string;
    hiddenProvidersPrefix: string;
    addGeminiProvider: string;
    lockedSectionTitle: string;
    lockedSectionDesc: string;
  };
}

export function ApiConfigProviderList({
  modelProviders,
  allModels,
  defaultModels,
  getModelsForProvider,
  onAddGeminiProvider,
  onToggleModel,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onReorderProviders,
  onDeleteModel,
  onUpdateModel,
  onDeleteProvider,
  onAddModel,
  onFlushConfig,
  onToggleProviderHidden,
  isProviderLocked,
  labels,
}: ApiConfigProviderListProps) {
  const [showHiddenProviders, setShowHiddenProviders] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderProviders(String(active.id), String(over.id));
    },
    [onReorderProviders],
  );

  const providerModelsById = useMemo(() => {
    const map = new Map<string, CustomModel[]>();
    for (const provider of modelProviders) {
      map.set(provider.id, getModelsForProvider(provider.id));
    }
    return map;
  }, [getModelsForProvider, modelProviders]);

  // 会员等级锁定：锁定供应商始终展示在独立的锁定区，不参与排序与折叠
  const hiddenProviders = useMemo(() => {
    return modelProviders.filter(
      (provider) => provider.hidden === true && !isProviderLocked(provider.id),
    );
  }, [modelProviders, isProviderLocked]);

  const visibleProviders = useMemo(() => {
    const hiddenIds = new Set(hiddenProviders.map((provider) => provider.id));
    return modelProviders.filter((provider) => !hiddenIds.has(provider.id));
  }, [hiddenProviders, modelProviders]);

  const unlockedProviders = useMemo(
    () => visibleProviders.filter((provider) => !isProviderLocked(provider.id)),
    [visibleProviders, isProviderLocked],
  );

  const lockedProviders = useMemo(
    () => visibleProviders.filter((provider) => isProviderLocked(provider.id)),
    [visibleProviders, isProviderLocked],
  );

  const hiddenProviderNames = hiddenProviders
    .map((provider) => provider.name)
    .join(' / ');

  return (
    <div className='space-y-4'>
      <ApiConfigPageHeader
        icon={<AppIcon name='globe' className='w-4 h-4' />}
        title={labels.providerPool}
        description={labels.providerPoolDesc}
      />

      {unlockedProviders.length === 0 &&
        lockedProviders.length === 0 &&
        hiddenProviders.length === 0 && (
          <div className='flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-6 py-10 text-center'>
            <AppIcon
              name='globe'
              className='h-6 w-6 text-[var(--glass-text-tertiary)]'
            />
            <p className='mt-3 text-sm font-medium text-[var(--glass-text-primary)]'>
              {labels.providerPool}
            </p>
            <p className='mt-1 max-w-md text-xs leading-5 text-[var(--glass-text-tertiary)]'>
              {labels.providerPoolDesc}
            </p>
          </div>
        )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={unlockedProviders.map((provider) => provider.id)}
          strategy={rectSortingStrategy}
        >
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            {unlockedProviders.map((provider) => (
              <SortableProviderCardItem
                key={provider.id}
                providerId={provider.id}
                dragLabel={labels.dragToSort}
              >
                {({ dragHandle }) => (
                  <ProviderCard
                    provider={provider}
                    dragHandle={dragHandle}
                    models={providerModelsById.get(provider.id) || []}
                    allModels={allModels}
                    defaultModels={defaultModels}
                    onToggleModel={(modelKey) =>
                      onToggleModel(modelKey, provider.id)
                    }
                    onUpdateApiKey={onUpdateApiKey}
                    onUpdateBaseUrl={onUpdateBaseUrl}
                    onDeleteModel={(modelKey) =>
                      onDeleteModel(modelKey, provider.id)
                    }
                    onUpdateModel={(modelKey, updates) =>
                      onUpdateModel(modelKey, updates, provider.id)
                    }
                    onDeleteProvider={onDeleteProvider}
                    onAddModel={onAddModel}
                    onFlushConfig={onFlushConfig}
                    onToggleProviderHidden={onToggleProviderHidden}
                    hideProviderLabel={labels.hideProvider}
                    showProviderLabel={labels.showProvider}
                  />
                )}
              </SortableProviderCardItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {lockedProviders.length > 0 && (
        <section className='pt-1'>
          <div className='mb-2 flex items-center gap-2'>
            <AppIcon
              name='lock'
              className='h-4 w-4 shrink-0 text-[var(--glass-text-tertiary)]'
            />
            <h3 className='text-sm font-semibold text-[var(--glass-text-secondary)]'>
              {labels.lockedSectionTitle}
            </h3>
          </div>
          <p className='mb-3 text-xs leading-5 text-[var(--glass-text-tertiary)]'>
            {labels.lockedSectionDesc}
          </p>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            {lockedProviders.map((provider) => (
              <LockedProviderCard
                key={`locked-${provider.id}`}
                name={provider.name}
                hasSavedKey={
                  provider.hasApiKey === true ||
                  (provider.apiKey || '').trim().length > 0
                }
                onClearSavedKey={() => onUpdateApiKey(provider.id, '')}
              />
            ))}
          </div>
        </section>
      )}
      {hiddenProviders.length > 0 && (
        <>
          <button
            type='button'
            onClick={() => setShowHiddenProviders((prev) => !prev)}
            className='glass-btn-base glass-btn-secondary flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left'
          >
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium text-[var(--glass-text-primary)]'>
                {showHiddenProviders
                  ? labels.hideHiddenProviders
                  : `${labels.showHiddenProviders} (${hiddenProviders.length})`}
              </p>
              <p className='truncate text-xs text-[var(--glass-text-tertiary)]'>
                {labels.hiddenProvidersPrefix}: {hiddenProviderNames}
              </p>
            </div>
            <AppIcon
              name={showHiddenProviders ? 'chevronUp' : 'chevronDown'}
              className='h-4 w-4 shrink-0 text-[var(--glass-text-secondary)]'
            />
          </button>
          {showHiddenProviders && (
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {hiddenProviders.map((provider) => (
                <ProviderCard
                  key={`hidden-${provider.id}`}
                  provider={provider}
                  models={providerModelsById.get(provider.id) || []}
                  allModels={allModels}
                  defaultModels={defaultModels}
                  onToggleModel={(modelKey) =>
                    onToggleModel(modelKey, provider.id)
                  }
                  onUpdateApiKey={onUpdateApiKey}
                  onUpdateBaseUrl={onUpdateBaseUrl}
                  onDeleteModel={(modelKey) =>
                    onDeleteModel(modelKey, provider.id)
                  }
                  onUpdateModel={(modelKey, updates) =>
                    onUpdateModel(modelKey, updates, provider.id)
                  }
                  onDeleteProvider={onDeleteProvider}
                  onAddModel={onAddModel}
                  onFlushConfig={onFlushConfig}
                  onToggleProviderHidden={onToggleProviderHidden}
                  hideProviderLabel={labels.hideProvider}
                  showProviderLabel={labels.showProvider}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface SortableProviderCardItemProps {
  providerId: string;
  dragLabel: string;
  children: (props: { dragHandle: ReactNode }) => ReactNode;
}

function SortableProviderCardItem({
  providerId,
  dragLabel,
  children,
}: SortableProviderCardItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: providerId });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 20 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        dragHandle: (
          <button
            type='button'
            aria-label={dragLabel}
            title={dragLabel}
            className='inline-flex cursor-grab items-center justify-center rounded-md p-1 text-[var(--glass-text-tertiary)] touch-none transition-colors hover:text-[var(--glass-text-secondary)] active:cursor-grabbing'
            {...attributes}
            {...listeners}
          >
            <AppIcon name='gripVertical' className='h-3.5 w-3.5' />
          </button>
        ),
      })}
    </div>
  );
}
