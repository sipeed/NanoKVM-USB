{
  "targets": [
    {
      "target_name": "mouse_hook",
      "sources": ["src/mouse_hook.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "MACOSX_DEPLOYMENT_TARGET": "12.0"
          },
          "link_settings": {
            "libraries": [
              "-framework CoreGraphics",
              "-framework CoreFoundation",
              "-framework ApplicationServices"
            ]
          }
        }]
      ]
    }
  ]
}
