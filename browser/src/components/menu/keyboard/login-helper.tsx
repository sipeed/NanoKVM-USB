import { useState } from 'react';
import { Button, Input, Modal } from 'antd';
import { KeyRoundIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { device } from '@/libs/device';
import { getLayoutById } from '@/libs/keyboard/layouts';
import { ModifierBits, KeycodeMap } from '@/libs/keyboard/keymap';
import { getTargetKeyboardLayout, getPasteSpeed } from '@/libs/storage';

async function typeText(text: string): Promise<void> {
  const layoutId = getTargetKeyboardLayout();
  const delay = getPasteSpeed();
  const layout = getLayoutById(layoutId);
  const keyUpDelay = Math.ceil(delay / 2);

  for (const char of text) {
    const mapping = layout[char];
    if (!mapping) continue;

    let modifier = 0;
    if (mapping.shift) modifier |= ModifierBits.LeftShift;
    if (mapping.altGr) modifier |= ModifierBits.RightAlt;

    // For modified keys (Shift/AltGr), press modifier first, then key
    // This is more compatible with Windows login screen
    if (modifier !== 0) {
      // Press modifier first
      await device.sendKeyboardData([modifier, 0, 0, 0, 0, 0, 0, 0]);
      await new Promise((r) => setTimeout(r, Math.max(delay, 20)));
    }
    
    // Press key (with modifier held)
    await device.sendKeyboardData([modifier, 0, mapping.code, 0, 0, 0, 0, 0]);
    await new Promise((r) => setTimeout(r, delay));

    // Release key (modifier still held)
    if (modifier !== 0) {
      await device.sendKeyboardData([modifier, 0, 0, 0, 0, 0, 0, 0]);
      await new Promise((r) => setTimeout(r, Math.max(keyUpDelay, 15)));
    }
    
    // Release modifier
    await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
    if (mapping.altGr) {
      await new Promise((r) => setTimeout(r, keyUpDelay));
      await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
    }
    await new Promise((r) => setTimeout(r, keyUpDelay));

    // For dead keys, send space
    if (mapping.deadKey) {
      await device.sendKeyboardData([0, 0, 0x2c, 0, 0, 0, 0, 0]);
      await new Promise((r) => setTimeout(r, delay));
      await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
      await new Promise((r) => setTimeout(r, keyUpDelay));
    }
  }
}

async function pressKey(code: string): Promise<void> {
  const hidCode = KeycodeMap[code];
  if (!hidCode) return;
  
  // Key down
  await device.sendKeyboardData([0, 0, hidCode, 0, 0, 0, 0, 0]);
  await new Promise((r) => setTimeout(r, 20));
  // Key up
  await device.sendKeyboardData([0, 0, 0, 0, 0, 0, 0, 0]);
  await new Promise((r) => setTimeout(r, 20));
}

interface LoginHelperProps {
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

export const LoginHelper = ({ externalOpen, onExternalClose }: LoginHelperProps = {}) => {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use external control if provided, otherwise internal
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSendUsername = async () => {
    if (!username || isSending) return;
    setIsSending(true);
    try {
      await typeText(username);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendPassword = async () => {
    if (!password || isSending) return;
    setIsSending(true);
    try {
      await typeText(password);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTab = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await pressKey('Tab');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendEnter = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await pressKey('Enter');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAll = async () => {
    if ((!username && !password) || isSending) return;
    setIsSending(true);
    try {
      if (username) {
        await typeText(username);
        await pressKey('Tab');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (password) {
        await typeText(password);
        await pressKey('Enter');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (externalOpen !== undefined && onExternalClose) {
      onExternalClose();
    } else {
      setInternalOpen(false);
    }
    setUsername('');
    setPassword('');
    setShowPassword(false);
  };

  // If externally controlled, don't render the button
  if (externalOpen !== undefined) {
    return (
      <Modal
        title={t('keyboard.loginHelper.title', 'Login Helper')}
        open={isOpen}
        onCancel={handleClose}
        footer={null}
        width={400}
      >
        <p className="mb-4 text-sm text-neutral-400">
          {t(
            'keyboard.loginHelper.description',
            'Use your password manager to auto-fill these fields, then send to the remote system.'
          )}
        </p>

        <div className="space-y-4">
          {/* Username field */}
          <div className="space-y-2">
            <label className="text-sm text-neutral-300">
              {t('keyboard.loginHelper.username', 'Username')}
            </label>
            <div className="flex space-x-2">
              <Input
                type="text"
                name="username"
                autoComplete="username"
                placeholder={t('keyboard.loginHelper.usernamePlaceholder', 'Enter username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSendUsername} disabled={!username || isSending}>
                {t('keyboard.loginHelper.send', 'Send')}
              </Button>
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <label className="text-sm text-neutral-300">
              {t('keyboard.loginHelper.password', 'Password')}
            </label>
            <div className="flex space-x-2">
              <Input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder={t('keyboard.loginHelper.passwordPlaceholder', 'Enter password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1"
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-neutral-400 hover:text-neutral-200"
                  >
                    {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                }
              />
              <Button onClick={handleSendPassword} disabled={!password || isSending}>
                {t('keyboard.loginHelper.send', 'Send')}
              </Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between pt-2">
            <div className="space-x-2">
              <Button size="small" onClick={handleSendTab} disabled={isSending}>
                Tab ↹
              </Button>
              <Button size="small" onClick={handleSendEnter} disabled={isSending}>
                Enter ↵
              </Button>
            </div>
            <Button
              type="primary"
              onClick={handleSendAll}
              disabled={(!username && !password) || isSending}
            >
              {t('keyboard.loginHelper.sendAll', 'Send All + Login')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <div
        className="flex h-[32px] cursor-pointer items-center space-x-2 rounded px-3 text-neutral-300 hover:bg-neutral-700/50"
        onClick={() => setInternalOpen(true)}
      >
        <KeyRoundIcon size={16} />
        <span>{t('keyboard.loginHelper.title', 'Login Helper')}</span>
      </div>

      <Modal
        title={t('keyboard.loginHelper.title', 'Login Helper')}
        open={isOpen}
        onCancel={handleClose}
        footer={null}
        width={400}
      >
        <p className="mb-4 text-sm text-neutral-400">
          {t(
            'keyboard.loginHelper.description',
            'Use your password manager to auto-fill these fields, then send to the remote system.'
          )}
        </p>

        <div className="space-y-4">
          {/* Username field */}
          <div className="space-y-2">
            <label className="text-sm text-neutral-300">
              {t('keyboard.loginHelper.username', 'Username')}
            </label>
            <div className="flex space-x-2">
              <Input
                type="text"
                name="username"
                autoComplete="username"
                placeholder={t('keyboard.loginHelper.usernamePlaceholder', 'Enter username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSendUsername} disabled={!username || isSending}>
                {t('keyboard.loginHelper.send', 'Send')}
              </Button>
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <label className="text-sm text-neutral-300">
              {t('keyboard.loginHelper.password', 'Password')}
            </label>
            <div className="flex space-x-2">
              <Input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder={t('keyboard.loginHelper.passwordPlaceholder', 'Enter password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1"
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-neutral-400 hover:text-neutral-200"
                  >
                    {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                }
              />
              <Button onClick={handleSendPassword} disabled={!password || isSending}>
                {t('keyboard.loginHelper.send', 'Send')}
              </Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between pt-2">
            <div className="space-x-2">
              <Button size="small" onClick={handleSendTab} disabled={isSending}>
                Tab ↹
              </Button>
              <Button size="small" onClick={handleSendEnter} disabled={isSending}>
                Enter ↵
              </Button>
            </div>
            <Button
              type="primary"
              onClick={handleSendAll}
              disabled={(!username && !password) || isSending}
            >
              {t('keyboard.loginHelper.sendAll', 'Send All + Login')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
