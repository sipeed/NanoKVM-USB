import { useState } from 'react';
import { Popover } from 'antd';
import { CameraIcon, MonitorIcon, CropIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { camera } from '@/libs/media/camera';

export const Screenshot = () => {
  const { t } = useTranslation();
  const [, setIsSelecting] = useState(false);

  const captureFullScreen = async () => {
    const stream = camera.getStream();
    if (!stream) return;

    const video = document.getElementById('video') as HTMLVideoElement;
    if (!video) return;

    // Create canvas with video dimensions
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    
    // Download the image
    downloadImage(canvas);
  };

  const captureArea = () => {
    setIsSelecting(true);
    
    const video = document.getElementById('video') as HTMLVideoElement;
    if (!video) return;

    const videoRect = video.getBoundingClientRect();
    
    // Create overlay for selection
    const overlay = document.createElement('div');
    overlay.id = 'screenshot-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      cursor: crosshair;
      z-index: 10000;
    `;
    
    // Selection box
    const selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
      position: fixed;
      border: 2px dashed #fff;
      background: rgba(255, 255, 255, 0.1);
      pointer-events: none;
      display: none;
    `;
    overlay.appendChild(selectionBox);
    
    // Instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10001;
    `;
    instructions.textContent = t('screenshot.dragToSelect', 'Drag to select area. Press Escape to cancel.');
    overlay.appendChild(instructions);
    
    document.body.appendChild(overlay);
    
    let startX = 0, startY = 0;
    let isDrawing = false;
    
    const handleMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      isDrawing = true;
      selectionBox.style.display = 'block';
      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      selectionBox.style.width = '0';
      selectionBox.style.height = '0';
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing) return;
      
      const currentX = e.clientX;
      const currentY = e.clientY;
      
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      
      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      if (!isDrawing) return;
      isDrawing = false;
      
      const endX = e.clientX;
      const endY = e.clientY;
      
      // Get selection coordinates relative to video
      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      
      // Clean up
      cleanup();
      
      // Only capture if selection is at least 10x10 pixels
      if (width > 10 && height > 10) {
        captureSelectedArea(left, top, width, height, videoRect);
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };
    
    const cleanup = () => {
      overlay.removeEventListener('mousedown', handleMouseDown);
      overlay.removeEventListener('mousemove', handleMouseMove);
      overlay.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.removeChild(overlay);
      setIsSelecting(false);
    };
    
    overlay.addEventListener('mousedown', handleMouseDown);
    overlay.addEventListener('mousemove', handleMouseMove);
    overlay.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
  };

  const captureSelectedArea = (
    screenLeft: number,
    screenTop: number,
    screenWidth: number,
    screenHeight: number,
    videoRect: DOMRect
  ) => {
    const video = document.getElementById('video') as HTMLVideoElement;
    if (!video) return;

    // Calculate the scale between video element and actual video dimensions
    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;
    
    // Convert screen coordinates to video coordinates
    const videoLeft = Math.max(0, (screenLeft - videoRect.left) * scaleX);
    const videoTop = Math.max(0, (screenTop - videoRect.top) * scaleY);
    const videoWidth = Math.min(screenWidth * scaleX, video.videoWidth - videoLeft);
    const videoHeight = Math.min(screenHeight * scaleY, video.videoHeight - videoTop);
    
    // Create canvas for cropped area
    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(
      video,
      videoLeft, videoTop, videoWidth, videoHeight,
      0, 0, videoWidth, videoHeight
    );
    
    downloadImage(canvas);
  };

  const downloadImage = async (canvas: HTMLCanvasElement) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    try {
      // Try using File System Access API for save dialog
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `screenshot-${timestamp}.png`,
          types: [
            {
              description: 'PNG Image',
              accept: { 'image/png': ['.png'] }
            }
          ]
        });
        
        const writable = await handle.createWritable();
        const blob = await new Promise<Blob>((resolve) => 
          canvas.toBlob((b) => resolve(b!), 'image/png')
        );
        await writable.write(blob);
        await writable.close();
      } else {
        // Fallback to download link
        const link = document.createElement('a');
        link.download = `screenshot-${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (err) {
      // User cancelled or error
      console.log(err);
    }
  };

  const content = (
    <div className="flex flex-col space-y-0.5">
      <div
        className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
        onClick={captureFullScreen}
      >
        <MonitorIcon size={16} />
        <span>{t('screenshot.fullScreen', 'Full Screen')}</span>
      </div>
      <div
        className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
        onClick={captureArea}
      >
        <CropIcon size={16} />
        <span>{t('screenshot.selectArea', 'Select Area')}</span>
      </div>
    </div>
  );

  return (
    <Popover content={content} placement="bottomLeft" trigger="click" arrow={false}>
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white">
        <CameraIcon size={18} />
      </div>
    </Popover>
  );
};
