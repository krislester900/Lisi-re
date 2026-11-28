import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  Compass,
  Feather,
  Globe,
  Home,
  Lock,
  MessageSquareHeart,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldAlert,
  Smartphone,
  Star,
  Users,
  X,
} from 'lucide-react';
import { ACCENT_TONE_PALETTES, STORY_THEMES } from '../lib/themes';
import { CustomSalon, StoryThemeId } from '../types/story';
import { PWAInstallButton } from './MobileAppModal';
import { SalonEmblem } from './SalonEmblem';

export type SidebarNavTab =
  | 'recits'
  | 'pour-vous'
  | 'pelemele'
  | 'membres'
  | 'themes'
  | 'passerelles'
  | 'carnet'
  | 'moderation'
  | 'confidentialite';

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeTab: SidebarNavTab;
  isOtherProfilesActive?: boolean;
  activeSalonId: StoryThemeId | null;
  activeCustomSalonId: string | null;
  exchangesCount: number;
  warningsCount: number;
  isModerationAdmin: boolean;
  pendingModerationCount: number;
  storyCountsBySalon: Record<string, number>;
  customSalons: CustomSalon[];
  onNavigateTab: (tab: SidebarNavTab) => void;
  onEnterSalon: (salonId: StoryThemeId | null) => void;
  onEnterCustomSalon: (customSalonId: string) => void;
  onCreateCustomSalon: () => void;
  onOpenMobileAppGuide?: () => void;
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  activeTab,
  isOtherProfilesActive,
  activeSalonId,
  activeCustomSalonId,
  exchangesCount,
  warningsCount,
  isModerationAdmin,
  pendingModerationCount,
  storyCountsBySalon,
  customSalons,
  onNavigateTab,
  onEnterSalon,
  onEnterCustomSalon,
  onCreateCustomSalon,
  onOpenMobileAppGuide,
}: AppSidebarProps) {
  const [brokenAvatarIds, setBrokenAvatarIds] = useState<Record<string, boolean>>({});
  const navItems: Array<{
    id: SidebarNavTab;
    label: string;
    icon: typeof Home;
    badge?: number;
    tone?: 'danger';
  }> = [
    { id: 'recits', label: 'Accueil & salons', icon: Home },
    { id: 'pour-vous', label: 'Pour vous', icon: Star },
    { id: 'pelemele', label: 'Pêle-mêle', icon: Compass },
    { id: 'membres', label: 'Autres profils', icon: Users },
    { id: 'themes', label: 'Romans & confessions', icon: Award },
    { id: 'passerelles', label: 'Passerelles', icon: MessageSquareHeart, badge: exchangesCount },
    { id: 'carnet', label: 'Mon carnet', icon: BookOpen, badge: warningsCount },
    ...(isModerationAdmin
      ? [
          {
            id: 'moderation' as const,
            label: 'Modération',
            icon: ShieldAlert,
            badge: pendingModerationCount,
            tone: 'danger' as const,
          },
        ]
      : []),
  ];

  const isHomeSelected =
    activeTab === 'recits' && activeSalonId === null && activeCustomSalonId === null;

  const renderSidebarBody = (isMobileDrawer: boolean) => {
    const isCompact = !isMobileDrawer && collapsed;

    return (
      <div className="flex flex-col h-full bg-[#F7F4EE] dark:bg-stone-900 text-stone-800 dark:text-stone-200">
        {/* Drawer header (mobile only) or Desktop collapse toggle */}
        {isMobileDrawer ? (
          <div className="px-4 py-3.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 bg-[#FBF9F5] dark:bg-stone-950">
            <span className="font-display text-lg font-medium text-stone-900 dark:text-stone-100">Navigation</span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Fermer le menu latéral"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div
            className={`px-3 pt-3 pb-2 flex items-center ${
              isCompact ? 'justify-center' : 'justify-between'
            }`}
          >
            {!isCompact && (
              <span className="px-2 text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400 font-medium">
                Espaces
              </span>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCompact ? 'Déployer le menu latéral' : 'Réduire le menu latéral'}
              aria-label={isCompact ? 'Déployer le menu latéral' : 'Réduire le menu latéral'}
              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/70 dark:hover:bg-stone-800 transition-colors"
            >
              {isCompact ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>
        )}

        {/* Scrollable Nav Sections */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-5">
          {/* Primary Destinations */}
          <nav aria-label={isMobileDrawer ? 'Navigation mobile' : 'Navigation principale'} className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.id === 'recits'
                  ? isHomeSelected
                  : item.id === 'membres'
                    ? (isOtherProfilesActive ?? activeTab === 'membres')
                    : activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  title={isCompact ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    if (item.id === 'recits') {
                      onEnterSalon(null);
                    } else {
                      onNavigateTab(item.id);
                    }
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  className={`w-full min-h-[38px] px-2.5 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${
                    isCompact ? 'justify-center' : 'justify-between gap-2.5'
                  } ${
                    isActive
                      ? item.tone === 'danger'
                        ? 'bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 font-semibold'
                        : 'bg-white dark:bg-stone-800 text-[#1E3A8A] dark:text-amber-300 font-semibold shadow-xs border border-stone-200/80 dark:border-stone-700'
                      : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/70 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        item.tone === 'danger'
                          ? 'text-red-700 dark:text-red-400'
                          : isActive
                            ? 'text-[#1E3A8A] dark:text-amber-300'
                            : 'text-stone-500 dark:text-stone-400'
                      }`}
                    />
                    {!isCompact && <span className="truncate">{item.label}</span>}
                  </span>
                  {!isCompact && typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 text-[11px] leading-none rounded tabular-nums ${
                        item.tone === 'danger'
                          ? 'bg-red-700 text-white'
                          : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* The 6 Salons */}
          <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800 space-y-1">
            {!isCompact && (
              <div className="px-2.5 pb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400 font-medium">
                  Les 6 salons
                </span>
              </div>
            )}

            <div className="space-y-0.5" role="group" aria-label="Accès direct aux salons">
              {STORY_THEMES.map((salon) => {
                const isSelected = activeTab === 'recits' && activeSalonId === salon.id;
                const count = storyCountsBySalon[salon.id] ?? 0;

                return (
                  <button
                    key={salon.id}
                    type="button"
                    title={isCompact ? `${salon.romanIndex} · ${salon.salonName}` : undefined}
                    aria-current={isSelected ? 'page' : undefined}
                    onClick={() => {
                      onEnterSalon(salon.id);
                      if (isMobileDrawer) onCloseMobile();
                    }}
                    style={
                      isSelected
                        ? {
                            borderColor: salon.palette.borderTint,
                            color: salon.palette.textAccent,
                          }
                        : undefined
                    }
                    className={`w-full min-h-[36px] px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center ${
                      isCompact ? 'justify-center' : 'justify-between gap-2'
                    } ${
                      isSelected
                        ? 'bg-white dark:bg-stone-800 border shadow-xs font-semibold dark:brightness-125'
                        : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/70 hover:text-stone-900 dark:hover:text-stone-100 border border-transparent'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <SalonEmblem
                        type={salon.emblem}
                        color={isSelected ? salon.palette.textAccent : salon.palette.swatch}
                        className="w-4 h-4 shrink-0"
                      />
                      {!isCompact && (
                        <span className="truncate">
                          {salon.romanIndex} · {salon.shortSalonName}
                        </span>
                      )}
                    </span>
                    {!isCompact && count > 0 && (
                      <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums shrink-0">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Community Salons (compact list when available) */}
          {!isCompact && (
            <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800 space-y-1">
              <div className="px-2.5 pb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400 font-medium">
                  Communauté
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onCreateCustomSalon();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  title="Créer un salon"
                  className="text-[11px] font-medium text-[#1E3A8A] dark:text-amber-300 hover:underline inline-flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  <span>Créer</span>
                </button>
              </div>

              {customSalons.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    onCreateCustomSalon();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  className="w-full px-2.5 py-2 rounded-md text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/70 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-2 transition-colors text-left"
                >
                  <Feather className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                  <span>Ouvrir un salon…</span>
                </button>
              ) : (
                <div className="space-y-0.5">
                  {customSalons.slice(0, 6).map((cs) => {
                    const isSelected = activeTab === 'recits' && activeCustomSalonId === cs.salonId;
                    const pal = ACCENT_TONE_PALETTES[cs.accentTone] ?? ACCENT_TONE_PALETTES.ink;
                    const hasAvatar = Boolean(cs.avatarUrl && !brokenAvatarIds[cs.salonId]);
                    return (
                      <button
                        key={cs.salonId}
                        type="button"
                        onClick={() => {
                          onEnterCustomSalon(cs.salonId);
                          if (isMobileDrawer) onCloseMobile();
                        }}
                        className={`w-full min-h-[34px] px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 text-left ${
                          isSelected
                            ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-semibold border border-stone-200 dark:border-stone-700 shadow-xs'
                            : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/70'
                        }`}
                      >
                        {hasAvatar ? (
                          <img
                            src={cs.avatarUrl}
                            alt=""
                            onError={() =>
                              setBrokenAvatarIds((prev) => ({ ...prev, [cs.salonId]: true }))
                            }
                            className="w-5 h-5 rounded-sm object-cover shrink-0 border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                          />
                        ) : cs.visibility === 'private' ? (
                          <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: pal.textAccent }} />
                        ) : (
                          <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: pal.textAccent }} />
                        )}
                        <span className="truncate">{cs.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile Version & PWA Install Link */}
        {onOpenMobileAppGuide && (
          <div
            className={`p-2.5 border-t border-stone-200/80 dark:border-stone-800 shrink-0 bg-[#F7F4EE] dark:bg-stone-900 ${
              isMobileDrawer ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))]' : ''
            }`}
          >
            {isCompact ? (
              <button
                type="button"
                onClick={onOpenMobileAppGuide}
                title="Version mobile & installation"
                aria-label="Version mobile et installation"
                className="w-full min-h-[36px] inline-flex items-center justify-center rounded-md border border-[#CBD6E6] dark:border-stone-700 bg-white dark:bg-stone-800 text-[#1B365D] dark:text-amber-300 hover:border-[#1B365D] transition-colors"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            ) : (
              <PWAInstallButton
                variant="sidebar"
                onOpenMobileGuide={() => {
                  onOpenMobileAppGuide();
                  if (isMobileDrawer) onCloseMobile();
                }}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Collapsible Sidebar */}
      <aside
        aria-label="Barre latérale des salons"
        className={`hidden lg:flex lg:flex-col shrink-0 border-r border-stone-200 dark:border-stone-800 bg-[#F7F4EE] dark:bg-stone-900 sticky top-[65px] h-[calc(100dvh-65px)] transition-[width] duration-200 ease-out motion-reduce:transition-none ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile Unified Slide-Over Drawer (replaces duplicate header/inline mobile menus) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Menu latéral">
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-stone-900/40 dark:bg-black/60 backdrop-blur-[1px]"
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[min(84vw,296px)] h-full border-r border-stone-200 dark:border-stone-800 bg-[#F7F4EE] dark:bg-stone-900 shadow-xl flex flex-col">
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}
    </>
  );
}
