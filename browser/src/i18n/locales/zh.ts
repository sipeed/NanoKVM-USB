const zh = {
  translation: {
    serial: {
      notSupported: '当前浏览器不支持串口，无法使用键鼠。请使用桌面版 Chrome 浏览器。',
      failed: '串口连接失败，请重试。'
    },
    camera: {
      tip: '等待授权...',
      denied: '权限不足',
      authorize: '远程桌面需要获取摄像头权限，请在浏览器设置中允许使用摄像头。',
      failed: '摄像头连接失败，请重试。'
    },
    modal: {
      title: '选择 USB 设备',
      selectVideo: '请选择视频输入设备',
      selectSerial: '选择串口设备'
    },
    menu: {
      serial: '串口',
      keyboard: '键盘',
      mouse: '鼠标'
    },
    video: {
      resolution: '分辨率',
      scale: '缩放',
      auto: '自动',
      rotation: '旋转',
      customResolution: '自定义',
      device: '设备',
      custom: {
        title: '自定义分辨率',
        width: '宽度',
        height: '高度',
        confirm: '确定',
        cancel: '取消'
      }
    },
    audio: {
      tip: '提示',
      permission:
        '网页需要麦克风权限来获取 USB 设备的音频信号。因为电脑系统会将 USB 音频输入设备识别为麦克风，而非扬声器。\n\n此操作仅用于设备连接，不会录制任何声音。',
      viewDoc: '查看文档。',
      ok: '确定'
    },
    keyboard: {
      paste: '粘贴',
      virtualKeyboard: '虚拟键盘',
      shortcut: {
        title: '快捷键',
        custom: '自定义',
        capture: '点击此处捕获快捷键',
        clear: '清空',
        save: '保存',
        captureTips: '捕获系统级按键（如 Windows 键）需要全屏权限。',
        enterFullScreen: '切换全屏模式。'
      }
    },
    mouse: {
      cursor: {
        title: '鼠标指针',
        pointer: '箭头',
        grab: '抓取',
        cell: '单元',
        hide: '隐藏'
      },
      mode: '鼠标模式',
      absolute: '绝对模式',
      relative: '相对模式',
      direction: '滚轮方向',
      scrollUp: '向上',
      scrollDown: '向下',
      speed: '滚轮速度',
      fast: '快',
      slow: '慢',
      requestPointer: '正在使用鼠标相对模式，请点击桌面获取鼠标指针。',
      jiggler: {
        title: '空闲晃动',
        enable: '启用',
        disable: '禁用'
      }
    },
    settings: {
      language: '语言',
      document: '文档',
      download: '下载'
    }
  }
};

export default zh;
