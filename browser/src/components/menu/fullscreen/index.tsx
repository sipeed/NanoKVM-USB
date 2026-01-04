import { useEffect, useState } from 'react';
import { MaximizeIcon, MinimizeIcon } from 'lucide-react';

export const Fullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }

    onFullscreenChange();

    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      const element = document.documentElement;
      element.requestFullscreen().then();

      // @ts-expect-error - https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock
      navigator.keyboard?.lock();
    } else {
      document.exitFullscreen().then();

      // @ts-expect-error - https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/unlock
      navigator.keyboard?.unlock();
    }
  }

  return (
    <div
      className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white"
      onClick={handleFullscreen}
    >
      {isFullscreen ? <MinimizeIcon size={18} /> : <MaximizeIcon size={18} />}
    </div>
  );
};
