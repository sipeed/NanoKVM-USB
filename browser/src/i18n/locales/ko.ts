const ko = {
  translation: {
    serial: {
      notSupported:
        '시리얼이 지원되지 않습니다. 마우스와 키보드를 사용하려면 Chrome 브라우저를 사용하세요.',
      failed: '시리얼 연결에 실패했습니다. 다시 시도해 주세요.'
    },
    camera: {
      tip: '권한을 기다리는 중...',
      denied: '권한이 거부되었습니다.',
      authorize:
        'Target PC 연결에 카메라 권한이 필요합니다. 브라우저 설정에서 카메라 권한을 허용해 주세요.',
      failed: '카메라 연결에 실패했습니다. 다시 시도해 주세요.'
    },
    modal: {
      title: 'USB 장치 선택',
      selectVideo: '비디오 입력 장치를 선택해 주세요.',
      selectSerial: '시리얼 장치를 선택해 주세요.'
    },
    menu: {
      serial: '시리얼',
      keyboard: '키보드',
      mouse: '마우스'
    },
    video: {
      resolution: '해상도',
      scale: '배율',
      customResolution: '사용자 정의',
      device: '장치',
      custom: {
        title: '사용자 정의 해상도',
        width: '가로',
        height: '세로',
        confirm: '확인',
        cancel: '취소'
      }
    },
    keyboard: {
      paste: '붙여넣기',
      virtualKeyboard: '가상 키보드',
      shortcut: {
        ctrlAltDel: 'Ctrl + Alt + Delete',
        ctrlD: 'Ctrl + D',
        winTab: 'Win + Tab'
      }
    },
    mouse: {
      cursor: {
        title: '커서 모양',
        pointer: '포인터',
        grab: '손',
        cell: '플러스',
        hide: '숨기기'
      },
      mode: '마우스 모드',
      absolute: '절대 모드',
      relative: '상대 모드',
      direction: '휠 방향',
      scrollUp: '위로 스크롤',
      scrollDown: '아래로 스크롤',
      speed: '휠 속도',
      fast: '빠르게',
      slow: '느리게',
      requestPointer: '상대 모드를 사용 중입니다. 마우스 포인터를 가져오려면 스크린을 클릭하세요.'
    },
    settings: {
      language: '언어',
      document: '문서',
      download: '다운로드'
    }
  }
};

export default ko;
