// Menu item identifiers
export type MenuItemId = 
  | 'video'
  | 'audio'
  | 'serialPort'
  | 'keyboard'
  | 'mouse'
  | 'recorder'
  | 'settings'
  | 'fullscreen';

// Submenu item identifiers (grouped by parent)
export type VideoSubItemId = 'video.resolution' | 'video.rotation' | 'video.scale' | 'video.device';
export type KeyboardSubItemId = 'keyboard.paste' | 'keyboard.virtualKeyboard' | 'keyboard.shortcuts';
export type MouseSubItemId = 'mouse.style' | 'mouse.mode' | 'mouse.direction' | 'mouse.speed' | 'mouse.jiggler';
export type SettingsSubItemId = 'settings.language' | 'settings.menuCustomization';

export type SubMenuItemId = VideoSubItemId | KeyboardSubItemId | MouseSubItemId | SettingsSubItemId;

// Menu configuration stored in localStorage
export interface MenuConfig {
  // Items visible in the main menu, in order (can include SubMenuItemId for promoted items)
  visibleItems: (MenuItemId | SubMenuItemId)[];
  // Items that are hidden
  hiddenItems: MenuItemId[];
  // Submenu items configuration (per parent menu)
  subMenus: {
    video: VideoSubItemId[];
    keyboard: KeyboardSubItemId[];
    mouse: MouseSubItemId[];
    settings: SettingsSubItemId[];
  };
  // Hidden submenu items
  hiddenSubItems: SubMenuItemId[];
  // Submenu items promoted to main menu
  promotedItems: SubMenuItemId[];
}

// Items that require serial connection to function
export const SERIAL_REQUIRED_ITEMS: MenuItemId[] = ['serialPort', 'keyboard', 'mouse'];

// Items that cannot be hidden
export const PROTECTED_ITEMS: MenuItemId[] = ['settings'];
export const PROTECTED_SUB_ITEMS: SubMenuItemId[] = ['settings.menuCustomization'];

// Default submenu configurations
export const DEFAULT_VIDEO_SUB_ITEMS: VideoSubItemId[] = ['video.resolution', 'video.rotation', 'video.scale', 'video.device'];
export const DEFAULT_KEYBOARD_SUB_ITEMS: KeyboardSubItemId[] = ['keyboard.paste', 'keyboard.virtualKeyboard', 'keyboard.shortcuts'];
export const DEFAULT_MOUSE_SUB_ITEMS: MouseSubItemId[] = ['mouse.style', 'mouse.mode', 'mouse.direction', 'mouse.speed', 'mouse.jiggler'];
export const DEFAULT_SETTINGS_SUB_ITEMS: SettingsSubItemId[] = ['settings.language', 'settings.menuCustomization'];

// Default menu configuration
export const DEFAULT_MENU_CONFIG: MenuConfig = {
  visibleItems: ['video', 'audio', 'serialPort', 'keyboard', 'mouse', 'recorder', 'settings', 'fullscreen'],
  hiddenItems: [],
  subMenus: {
    video: [...DEFAULT_VIDEO_SUB_ITEMS],
    keyboard: [...DEFAULT_KEYBOARD_SUB_ITEMS],
    mouse: [...DEFAULT_MOUSE_SUB_ITEMS],
    settings: [...DEFAULT_SETTINGS_SUB_ITEMS],
  },
  hiddenSubItems: [],
  promotedItems: [],
};

// Check if an item ID is a submenu item
export function isSubMenuItem(id: string): id is SubMenuItemId {
  return id.includes('.');
}

// Get parent menu ID from submenu item ID
export function getParentMenuId(subItemId: SubMenuItemId): MenuItemId {
  return subItemId.split('.')[0] as MenuItemId;
}

// Menu item metadata for UI
export interface MenuItemMeta {
  id: MenuItemId;
  labelKey: string;
  defaultLabel: string;
  requiresSerial: boolean;
  isProtected: boolean;
}

export const MENU_ITEMS_META: MenuItemMeta[] = [
  { id: 'video', labelKey: 'menu.video', defaultLabel: 'Video', requiresSerial: false, isProtected: false },
  { id: 'audio', labelKey: 'menu.audio', defaultLabel: 'Audio', requiresSerial: false, isProtected: false },
  { id: 'serialPort', labelKey: 'menu.serialPort', defaultLabel: 'Serial Port', requiresSerial: true, isProtected: false },
  { id: 'keyboard', labelKey: 'menu.keyboard', defaultLabel: 'Keyboard', requiresSerial: true, isProtected: false },
  { id: 'mouse', labelKey: 'menu.mouse', defaultLabel: 'Mouse', requiresSerial: true, isProtected: false },
  { id: 'recorder', labelKey: 'menu.recorder', defaultLabel: 'Recorder', requiresSerial: false, isProtected: false },
  { id: 'settings', labelKey: 'menu.settings', defaultLabel: 'Settings', requiresSerial: false, isProtected: true },
  { id: 'fullscreen', labelKey: 'menu.fullscreen', defaultLabel: 'Fullscreen', requiresSerial: false, isProtected: false },
];

// Submenu item metadata
export interface SubMenuItemMeta {
  id: SubMenuItemId;
  parent: MenuItemId;
  labelKey: string;
  defaultLabel: string;
  isProtected: boolean;
  requiresSerial: boolean;
}

export const SUB_MENU_ITEMS_META: SubMenuItemMeta[] = [
  // Video submenu
  { id: 'video.resolution', parent: 'video', labelKey: 'video.resolution', defaultLabel: 'Resolution', isProtected: false, requiresSerial: false },
  { id: 'video.rotation', parent: 'video', labelKey: 'video.rotation', defaultLabel: 'Rotation', isProtected: false, requiresSerial: false },
  { id: 'video.scale', parent: 'video', labelKey: 'video.scale', defaultLabel: 'Scale', isProtected: false, requiresSerial: false },
  { id: 'video.device', parent: 'video', labelKey: 'video.device', defaultLabel: 'Device', isProtected: false, requiresSerial: false },
  // Keyboard submenu
  { id: 'keyboard.paste', parent: 'keyboard', labelKey: 'keyboard.paste', defaultLabel: 'Paste', isProtected: false, requiresSerial: true },
  { id: 'keyboard.virtualKeyboard', parent: 'keyboard', labelKey: 'keyboard.virtualKeyboard', defaultLabel: 'Virtual Keyboard', isProtected: false, requiresSerial: true },
  { id: 'keyboard.shortcuts', parent: 'keyboard', labelKey: 'keyboard.shortcut.title', defaultLabel: 'Shortcuts', isProtected: false, requiresSerial: true },
  // Mouse submenu
  { id: 'mouse.style', parent: 'mouse', labelKey: 'mouse.cursor.title', defaultLabel: 'Cursor Style', isProtected: false, requiresSerial: true },
  { id: 'mouse.mode', parent: 'mouse', labelKey: 'mouse.mode', defaultLabel: 'Mode', isProtected: false, requiresSerial: true },
  { id: 'mouse.direction', parent: 'mouse', labelKey: 'mouse.direction', defaultLabel: 'Wheel Direction', isProtected: false, requiresSerial: true },
  { id: 'mouse.speed', parent: 'mouse', labelKey: 'mouse.speed', defaultLabel: 'Wheel Speed', isProtected: false, requiresSerial: true },
  { id: 'mouse.jiggler', parent: 'mouse', labelKey: 'mouse.jiggler.title', defaultLabel: 'Mouse Jiggler', isProtected: false, requiresSerial: true },
  // Settings submenu
  { id: 'settings.language', parent: 'settings', labelKey: 'settings.language', defaultLabel: 'Language', isProtected: false, requiresSerial: false },
  { id: 'settings.menuCustomization', parent: 'settings', labelKey: 'settings.customizeMenu', defaultLabel: 'Customize Menu', isProtected: true, requiresSerial: false },
];

// Helper to get metadata for an item
export function getMenuItemMeta(id: MenuItemId): MenuItemMeta | undefined {
  return MENU_ITEMS_META.find(item => item.id === id);
}

// Helper to get metadata for a submenu item
export function getSubMenuItemMeta(id: SubMenuItemId): SubMenuItemMeta | undefined {
  return SUB_MENU_ITEMS_META.find(item => item.id === id);
}

// Get all submenu items for a parent
export function getSubMenuItemsForParent(parent: MenuItemId): SubMenuItemMeta[] {
  return SUB_MENU_ITEMS_META.filter(item => item.parent === parent);
}

// Validate and fix menu config (ensure all items exist, settings is visible)
export function validateMenuConfig(config: MenuConfig): MenuConfig {
  const allMenuItems = new Set<MenuItemId>(DEFAULT_MENU_CONFIG.visibleItems as MenuItemId[]);
  const allSubItems = new Set<SubMenuItemId>(SUB_MENU_ITEMS_META.map(m => m.id));
  
  // Separate menu items and promoted submenu items in visibleItems
  const promotedItems = config.promotedItems ?? [];
  const visibleItems: (MenuItemId | SubMenuItemId)[] = [];
  const hiddenItems = [...(config.hiddenItems ?? [])];
  
  // Process visible items - keep valid menu items and promoted submenu items
  for (const item of config.visibleItems ?? []) {
    if (isSubMenuItem(item)) {
      if (allSubItems.has(item) && promotedItems.includes(item)) {
        visibleItems.push(item);
      }
    } else if (allMenuItems.has(item as MenuItemId)) {
      visibleItems.push(item);
    }
  }
  
  // Add any missing menu items
  for (const item of allMenuItems) {
    if (!visibleItems.includes(item) && !hiddenItems.includes(item)) {
      visibleItems.push(item);
    }
  }
  
  // Ensure settings is always visible
  if (hiddenItems.includes('settings')) {
    const idx = hiddenItems.indexOf('settings');
    hiddenItems.splice(idx, 1);
    if (!visibleItems.includes('settings')) {
      visibleItems.push('settings');
    }
  }
  
  // Remove any invalid hidden items
  const validHidden = hiddenItems.filter(item => allMenuItems.has(item));
  
  // Validate submenus - use defaults if not present or merge missing items
  const subMenus = config.subMenus ?? DEFAULT_MENU_CONFIG.subMenus;
  const hiddenSubItems = config.hiddenSubItems ?? [];
  
  // Ensure all submenu items exist (excluding promoted ones)
  const validateSubMenu = <T extends SubMenuItemId>(items: T[], defaults: T[]): T[] => {
    const allItems = new Set<T>(defaults);
    const result = items.filter(item => allItems.has(item) && !promotedItems.includes(item));
    // Add any missing items (that aren't hidden or promoted)
    for (const item of defaults) {
      if (!result.includes(item) && !hiddenSubItems.includes(item) && !promotedItems.includes(item)) {
        result.push(item);
      }
    }
    return result;
  };
  
  // Ensure menuCustomization is never hidden or promoted
  const validHiddenSubItems = hiddenSubItems.filter(
    item => !PROTECTED_SUB_ITEMS.includes(item)
  );
  const validPromotedItems = promotedItems.filter(
    item => allSubItems.has(item) && !PROTECTED_SUB_ITEMS.includes(item)
  );
  
  return {
    visibleItems,
    hiddenItems: validHidden,
    subMenus: {
      video: validateSubMenu(subMenus.video ?? [], DEFAULT_VIDEO_SUB_ITEMS),
      keyboard: validateSubMenu(subMenus.keyboard ?? [], DEFAULT_KEYBOARD_SUB_ITEMS),
      mouse: validateSubMenu(subMenus.mouse ?? [], DEFAULT_MOUSE_SUB_ITEMS),
      settings: validateSubMenu(subMenus.settings ?? [], DEFAULT_SETTINGS_SUB_ITEMS),
    },
    hiddenSubItems: validHiddenSubItems,
    promotedItems: validPromotedItems,
  };
}
