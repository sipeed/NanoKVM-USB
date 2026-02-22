import { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { useAtomValue } from 'jotai';

import { showTooltipsAtom } from './settings/tooltips';

interface MenuTooltipProps {
  title: string;
  children: ReactNode;
}

export const MenuTooltip = ({ title, children }: MenuTooltipProps) => {
  const showTooltips = useAtomValue(showTooltipsAtom);

  if (!showTooltips) {
    return <>{children}</>;
  }

  return (
    <Tooltip title={title} placement="bottom" mouseEnterDelay={0.5}>
      {children}
    </Tooltip>
  );
};
