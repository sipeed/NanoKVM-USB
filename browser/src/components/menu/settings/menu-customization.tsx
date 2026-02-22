import { useState } from 'react';
import { Modal, Button, Collapse } from 'antd';
import { useAtom } from 'jotai';
import {
  LayoutGridIcon,
  EyeIcon,
  EyeOffIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  RotateCcwIcon,
  LockIcon,
  ArrowUpFromLineIcon,
  ArrowDownFromLineIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { menuConfigAtom } from '@/jotai/device';
import {
  type MenuItemId,
  type MenuConfig,
  type SubMenuItemId,
  MENU_ITEMS_META,
  SUB_MENU_ITEMS_META,
  DEFAULT_MENU_CONFIG,
  PROTECTED_ITEMS,
  PROTECTED_SUB_ITEMS,
  isSubMenuItem,
  getParentMenuId,
} from '@/libs/menu-config';
import * as storage from '@/libs/storage';

export const MenuCustomization = () => {
  const { t } = useTranslation();
  const [menuConfig, setMenuConfig] = useAtom(menuConfigAtom);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<MenuConfig>(menuConfig);

  const openModal = () => {
    setLocalConfig({ ...menuConfig });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const saveConfig = () => {
    setMenuConfig(localConfig);
    storage.setMenuConfig(localConfig);
    setIsModalOpen(false);
  };

  const resetToDefaults = () => {
    setLocalConfig({ ...DEFAULT_MENU_CONFIG });
  };

  const moveItem = (itemId: MenuItemId | SubMenuItemId, direction: 'up' | 'down') => {
    const items = [...localConfig.visibleItems];
    const idx = items.indexOf(itemId);
    if (idx === -1) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;

    // Swap
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setLocalConfig({ ...localConfig, visibleItems: items });
  };

  const toggleVisibility = (itemId: MenuItemId) => {
    // Don't allow hiding protected items
    if (PROTECTED_ITEMS.includes(itemId)) return;

    const isVisible = localConfig.visibleItems.includes(itemId);

    if (isVisible) {
      // Move to hidden
      setLocalConfig({
        ...localConfig,
        visibleItems: localConfig.visibleItems.filter((id) => id !== itemId),
        hiddenItems: [...localConfig.hiddenItems, itemId],
      });
    } else {
      // Move to visible
      setLocalConfig({
        ...localConfig,
        visibleItems: [...localConfig.visibleItems, itemId],
        hiddenItems: localConfig.hiddenItems.filter((id) => id !== itemId),
      });
    }
  };

  const getItemLabel = (itemId: MenuItemId | SubMenuItemId): string => {
    // Check if it's a submenu item (promoted)
    if (isSubMenuItem(itemId)) {
      const meta = SUB_MENU_ITEMS_META.find((m) => m.id === itemId);
      if (!meta) return itemId;
      return t(meta.labelKey, meta.defaultLabel);
    }
    const meta = MENU_ITEMS_META.find((m) => m.id === itemId);
    if (!meta) return itemId;
    return t(meta.labelKey, meta.defaultLabel);
  };

  const getSubItemLabel = (itemId: SubMenuItemId): string => {
    const meta = SUB_MENU_ITEMS_META.find((m) => m.id === itemId);
    if (!meta) return itemId;
    return t(meta.labelKey, meta.defaultLabel);
  };

  const isProtected = (itemId: MenuItemId): boolean => {
    return PROTECTED_ITEMS.includes(itemId);
  };

  const isSubItemProtected = (itemId: SubMenuItemId): boolean => {
    return PROTECTED_SUB_ITEMS.includes(itemId);
  };

  const moveSubItem = (parent: 'video' | 'keyboard' | 'mouse' | 'settings', itemId: SubMenuItemId, direction: 'up' | 'down') => {
    const items = [...localConfig.subMenus[parent]];
    const idx = items.indexOf(itemId as never);
    if (idx === -1) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;

    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setLocalConfig({
      ...localConfig,
      subMenus: { ...localConfig.subMenus, [parent]: items },
    });
  };

  const toggleSubItemVisibility = (parent: 'video' | 'keyboard' | 'mouse' | 'settings', itemId: SubMenuItemId) => {
    if (isSubItemProtected(itemId)) return;

    const isVisible = localConfig.subMenus[parent].includes(itemId as never);

    if (isVisible) {
      setLocalConfig({
        ...localConfig,
        subMenus: {
          ...localConfig.subMenus,
          [parent]: localConfig.subMenus[parent].filter((id) => id !== itemId),
        },
        hiddenSubItems: [...localConfig.hiddenSubItems, itemId],
      });
    } else {
      setLocalConfig({
        ...localConfig,
        subMenus: {
          ...localConfig.subMenus,
          [parent]: [...localConfig.subMenus[parent], itemId as never],
        },
        hiddenSubItems: localConfig.hiddenSubItems.filter((id) => id !== itemId),
      });
    }
  };

  const promoteToMainMenu = (parent: 'video' | 'keyboard' | 'mouse' | 'settings', itemId: SubMenuItemId) => {
    if (isSubItemProtected(itemId)) return;
    
    // Remove from submenu
    const newSubMenus = {
      ...localConfig.subMenus,
      [parent]: localConfig.subMenus[parent].filter((id) => id !== itemId),
    };
    
    // Add to promoted items and visible items
    const newPromotedItems = [...localConfig.promotedItems, itemId];
    const newVisibleItems = [...localConfig.visibleItems, itemId];
    
    setLocalConfig({
      ...localConfig,
      visibleItems: newVisibleItems,
      subMenus: newSubMenus,
      promotedItems: newPromotedItems,
    });
  };

  const demoteFromMainMenu = (itemId: SubMenuItemId) => {
    if (isSubItemProtected(itemId)) return;
    
    const parent = getParentMenuId(itemId) as 'video' | 'keyboard' | 'mouse' | 'settings';
    
    // Remove from visibleItems and promotedItems
    const newVisibleItems = localConfig.visibleItems.filter((id) => id !== itemId);
    const newPromotedItems = localConfig.promotedItems.filter((id) => id !== itemId);
    
    // Add back to submenu
    const newSubMenus = {
      ...localConfig.subMenus,
      [parent]: [...localConfig.subMenus[parent], itemId as never],
    };
    
    setLocalConfig({
      ...localConfig,
      visibleItems: newVisibleItems,
      subMenus: newSubMenus,
      promotedItems: newPromotedItems,
    });
  };

  const renderSubMenuItems = (parent: 'video' | 'keyboard' | 'mouse' | 'settings', items: SubMenuItemId[]) => (
    <div className="space-y-1">
      {items.map((itemId, idx) => (
        <div
          key={itemId}
          className="flex items-center justify-between rounded bg-neutral-700/50 px-2 py-1.5"
        >
          <span className="text-sm text-neutral-300">{getSubItemLabel(itemId)}</span>
          <div className="flex items-center space-x-0.5">
            <button
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-600 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
              onClick={() => moveSubItem(parent, itemId, 'up')}
              disabled={idx === 0}
              title={t('settings.moveUp', 'Move Up')}
            >
              <ChevronUpIcon size={14} />
            </button>
            <button
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-600 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
              onClick={() => moveSubItem(parent, itemId, 'down')}
              disabled={idx === items.length - 1}
              title={t('settings.moveDown', 'Move Down')}
            >
              <ChevronDownIcon size={14} />
            </button>
            {isSubItemProtected(itemId) ? (
              <span className="rounded p-0.5 text-neutral-500">
                <LockIcon size={14} />
              </span>
            ) : (
              <>
                <button
                  className="rounded p-0.5 text-blue-400 hover:bg-neutral-600 hover:text-blue-300"
                  onClick={() => promoteToMainMenu(parent, itemId)}
                  title={t('settings.promoteToMain', 'Move to Main Menu')}
                >
                  <ArrowUpFromLineIcon size={14} />
                </button>
                <button
                  className="rounded p-0.5 text-neutral-400 hover:bg-neutral-600 hover:text-white"
                  onClick={() => toggleSubItemVisibility(parent, itemId)}
                  title={t('settings.hide', 'Hide')}
                >
                  <EyeOffIcon size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const getHiddenSubItemsForParent = (parent: MenuItemId): SubMenuItemId[] => {
    return localConfig.hiddenSubItems.filter((id) => id.startsWith(`${parent}.`));
  };

  const renderHiddenSubItems = (parent: 'video' | 'keyboard' | 'mouse' | 'settings') => {
    const hidden = getHiddenSubItemsForParent(parent);
    if (hidden.length === 0) return null;
    return (
      <div className="mt-2 space-y-1">
        <span className="text-xs text-neutral-500">{t('settings.hiddenItems', 'Hidden Items')}:</span>
        {hidden.map((itemId) => (
          <div
            key={itemId}
            className="flex items-center justify-between rounded bg-neutral-800/30 px-2 py-1.5"
          >
            <span className="text-sm text-neutral-500">{getSubItemLabel(itemId)}</span>
            <button
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-600 hover:text-white"
              onClick={() => toggleSubItemVisibility(parent, itemId)}
            >
              <EyeIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div
        className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
        onClick={openModal}
      >
        <LayoutGridIcon size={16} />
        <span>{t('settings.customizeMenu', 'Customize Menu')}</span>
      </div>

      <Modal
        title={t('settings.customizeMenu', 'Customize Menu')}
        open={isModalOpen}
        onCancel={closeModal}
        footer={[
          <Button key="reset" onClick={resetToDefaults}>
            <RotateCcwIcon size={14} className="mr-1" />
            {t('settings.resetDefaults', 'Reset to Defaults')}
          </Button>,
          <Button key="cancel" onClick={closeModal}>
            {t('settings.cancel', 'Cancel')}
          </Button>,
          <Button key="save" type="primary" onClick={saveConfig}>
            {t('settings.save', 'Save')}
          </Button>,
        ]}
        width={600}
      >
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {/* Main Menu Items */}
          <Collapse
            defaultActiveKey={['mainMenu']}
            ghost
            items={[
              {
                key: 'mainMenu',
                label: <span className="text-sm font-medium text-neutral-300">{t('settings.mainMenu', 'Main Menu')}</span>,
                children: (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      {localConfig.visibleItems.map((itemId, idx) => {
                        const isPromotedItem = isSubMenuItem(itemId);
                        const isProtectedItem = isPromotedItem ? isSubItemProtected(itemId as SubMenuItemId) : isProtected(itemId as MenuItemId);
                        
                        return (
                          <div
                            key={itemId}
                            className={`flex items-center justify-between rounded px-3 py-2 ${isPromotedItem ? 'bg-neutral-700/70' : 'bg-neutral-800'}`}
                          >
                            <div className="flex items-center space-x-2">
                              {isPromotedItem && (
                                <span className="text-[10px] text-blue-400 uppercase">{t('settings.promoted', 'Promoted')}</span>
                              )}
                              <span className="text-neutral-200">{getItemLabel(itemId)}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button
                                className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                                onClick={() => moveItem(itemId, 'up')}
                                disabled={idx === 0}
                              >
                                <ChevronUpIcon size={16} />
                              </button>
                              <button
                                className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                                onClick={() => moveItem(itemId, 'down')}
                                disabled={idx === localConfig.visibleItems.length - 1}
                              >
                                <ChevronDownIcon size={16} />
                              </button>
                              {isProtectedItem ? (
                                <span className="rounded p-1 text-neutral-500">
                                  <LockIcon size={16} />
                                </span>
                              ) : isPromotedItem ? (
                                <button
                                  className="rounded p-1 text-blue-400 hover:bg-neutral-700 hover:text-blue-300"
                                  onClick={() => demoteFromMainMenu(itemId as SubMenuItemId)}
                                  title={t('settings.demoteToSubmenu', 'Move to Submenu')}
                                >
                                  <ArrowDownFromLineIcon size={16} />
                                </button>
                              ) : (
                                <button
                                  className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                                  onClick={() => toggleVisibility(itemId as MenuItemId)}
                                >
                                  <EyeOffIcon size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {localConfig.hiddenItems.length > 0 && (
                      <div>
                        <span className="text-xs text-neutral-500">{t('settings.hiddenItems', 'Hidden Items')}:</span>
                        <div className="mt-1 space-y-1">
                          {localConfig.hiddenItems.map((itemId) => (
                            <div
                              key={itemId}
                              className="flex items-center justify-between rounded bg-neutral-800/50 px-3 py-2"
                            >
                              <span className="text-neutral-400">{getItemLabel(itemId)}</span>
                              <button
                                className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                                onClick={() => toggleVisibility(itemId)}
                              >
                                <EyeIcon size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />

          {/* Submenus */}
          <Collapse
            ghost
            items={[
              {
                key: 'video',
                label: <span className="text-sm font-medium text-neutral-300">{t('menu.video', 'Video')} {t('settings.submenu', 'Submenu')}</span>,
                children: (
                  <>
                    {renderSubMenuItems('video', localConfig.subMenus.video)}
                    {renderHiddenSubItems('video')}
                  </>
                ),
              },
              {
                key: 'keyboard',
                label: <span className="text-sm font-medium text-neutral-300">{t('menu.keyboard', 'Keyboard')} {t('settings.submenu', 'Submenu')}</span>,
                children: (
                  <>
                    {renderSubMenuItems('keyboard', localConfig.subMenus.keyboard)}
                    {renderHiddenSubItems('keyboard')}
                  </>
                ),
              },
              {
                key: 'mouse',
                label: <span className="text-sm font-medium text-neutral-300">{t('menu.mouse', 'Mouse')} {t('settings.submenu', 'Submenu')}</span>,
                children: (
                  <>
                    {renderSubMenuItems('mouse', localConfig.subMenus.mouse)}
                    {renderHiddenSubItems('mouse')}
                  </>
                ),
              },
              {
                key: 'settings',
                label: <span className="text-sm font-medium text-neutral-300">{t('menu.settings', 'Settings')} {t('settings.submenu', 'Submenu')}</span>,
                children: (
                  <>
                    {renderSubMenuItems('settings', localConfig.subMenus.settings)}
                    {renderHiddenSubItems('settings')}
                  </>
                ),
              },
            ]}
          />
        </div>
      </Modal>
    </>
  );
};
