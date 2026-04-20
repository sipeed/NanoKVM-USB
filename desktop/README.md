# NanoKVM-USB Desktop

This is the NanoKVM-USB desktop version project.

## Development

```shell
cd desktop
pnpm install
pnpm start
```

## Compile

```shell
# For Windows
pnpm build:win

# For MacOS
pnpm build:mac

# For Linux
pnpm build:linux
```

## MacOS w/Logi Options+ Mouse Side-Button Support (optional)

On macOS running Logi Options+, the app can optionally forward mouse side
buttons to the KVM target as `BTN_SIDE`/`BTN_EXTRA` HID reports, driven by a
native CGEventTap addon in `native/macos/`. **This path is specifically for
users running Logitech Options+** with the side buttons mapped to back/forward
navigation — the default rules match the gesture events LO+ emits in that
configuration.

The app runs fine without this — if the addon isn't built, side-button
forwarding is silently disabled and everything else works normally.

### Building the addon

Before running `pnpm build:mac`, build the addon against Electron's Node
headers and drop the `.node` into `resources/`:

```shell
cd native/macos
npm install --ignore-scripts
npx node-gyp rebuild \
  --target=$(node -e "console.log(require('../../node_modules/electron/package.json').version)") \
  --arch=arm64 \
  --dist-url=https://electronjs.org/headers
cd ../..
mkdir -p resources/native
cp native/macos/build/Release/mouse_hook.node resources/native/
```

### Customizing the rule set

Which events get mapped is driven by a declarative rule file. The shipped
defaults target Logi Options+ back/forward gestures — see
[`resources/side-button-rules.default.json`](resources/side-button-rules.default.json)
for the schema.

To override, drop a `side-button-rules.json` into the app's `userData`
directory (`~/Library/Application Support/nanokvm-usb/` on macOS):

```json
[
  {
    "name": "My custom rule",
    "eventType": 29,
    "fields": [
      { "field": 132, "equals": 4 },
      { "field": 115, "equals": [4, 8] }
    ],
    "emit": "side"
  }
]
```

Each rule matches a single `CGEventType` plus zero or more field-equality
checks (integer fields only; `equals` accepts a value or array of values).
First matching rule wins; non-matching events pass through untouched.
