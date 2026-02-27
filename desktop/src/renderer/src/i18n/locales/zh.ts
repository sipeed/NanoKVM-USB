const zh = {
  translation: {
    camera: {
      tip: '等待授权...',
      denied: '权限不足',
      authorize: '远程桌面需要获取摄像头权限，请在设置中授予访问权限。',
      failed: '摄像头连接失败，请重试。'
    },
    modal: {
      title: '选择 USB 设备',
      selectVideo: '请选择视频输入设备',
      selectSerial: '请选择串口设备',
      selectBaudRate: '请选择波特率'
    },
    menu: {
      serial: '串口',
      keyboard: '键盘',
      mouse: '鼠标',
      serialPort: {
        device: '串口设备',
        baudRate: '波特率',
        noDeviceFound: '未找到串口设备',
        clickToSelect: '点击选择串口'
      }
    },
    video: {
      auto: '自动',
      resolution: '分辨率',
      scale: '缩放',
      customResolution: '自定义',
      device: '设备',
      maxResolution: {
        title: '最大分辨率',
        mode1440p30: '2560x1440@30fps',
        mode1080p60: '1920x1080@60fps'
      },
      custom: {
        title: '自定义分辨率',
        width: '宽度',
        height: '高度',
        confirm: '确定',
        cancel: '取消'
      },
      info: {
        title: '显示信息',
        capturedResolution: '捕获分辨率',
        displayResolution: '显示分辨率',
        displayScale: '显示比例'
      }
    },
    audio: {
      tip: '提示',
      permission:
        '需要麦克风权限来获取 USB 设备的音频信号。因为电脑系统会将 USB 音频输入设备识别为麦克风，而非扬声器。\n\n此操作仅用于设备连接，不会录制任何声音。',
      viewDoc: '查看文档。',
      ok: '确定'
    },
    kkeyboard: {
      paste: '粘贴',
      virtualKeyboard: '虚拟键盘',
      shortcut: {
        title: '快捷键',
        custom: '自定义',
        capture: '点击此处捕获快捷键',
        clear: '清空',
        save: '保存'
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
      title: '设置',
      appearance: {
        title: '外观',
        language: '语言',
        menu: '菜单栏',
        menuTips: '启动时是否打开菜单栏'
      },
      update: {
        title: '更新',
        latest: '已经是最新版本。',
        outdated: '有新的可用版本，确定要更新吗？',
        downloading: '下载中...',
        installing: '安装中...',
        failed: '更新失败，请重试。',
        confirm: '确认'
      },
      about: {
        title: '关于',
        version: '版本',
        community: '社区'
      },
      reset: {
        title: '重置设置',
        description: '将所有应用程序设置重置为默认值',
        warning: '警告',
        warningDescription: '此操作无法撤销。所有自定义设置将丢失。',
        button: '重置所有设置',
        confirmTitle: '确认重置',
        confirmMessage: '您确定要重置所有设置吗？此操作无法撤销。',
        confirm: '重置',
        cancel: '取消'
      }
    }
  }
}

export default zh
