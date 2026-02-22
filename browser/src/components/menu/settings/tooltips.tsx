import { Checkbox } from 'antd';
import { useAtom } from 'jotai';
import { atom } from 'jotai';
import { MessageSquareIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import * as storage from '@/libs/storage';

// Atom for tooltip visibility
export const showTooltipsAtom = atom(storage.getShowTooltips());

export const TooltipsSetting = () => {
  const { t } = useTranslation();
  const [showTooltips, setShowTooltips] = useAtom(showTooltipsAtom);

  function handleChange(checked: boolean) {
    setShowTooltips(checked);
    storage.setShowTooltips(checked);
  }

  return (
    <div className="flex h-[32px] items-center space-x-2 rounded px-3 text-neutral-300">
      <MessageSquareIcon size={16} />
      <span className="text-sm">{t('settings.tooltips.title', 'Show Tooltips')}:</span>
      <Checkbox
        checked={showTooltips}
        onChange={(e) => handleChange(e.target.checked)}
      />
    </div>
  );
};
