#!/bin/bash
set -e
cd "$(dirname "$0")"
echo Building NanoKVM...
swiftc NanoKVM.swift -o NanoKVM_bin -framework AppKit -framework AVFoundation -framework CoreMedia -framework AudioToolbox -framework VideoToolbox -framework UniformTypeIdentifiers -framework Metal -O
echo Creating app bundle...
rm -rf NanoKVM.app
mkdir -p NanoKVM.app/Contents/MacOS
mv NanoKVM_bin NanoKVM.app/Contents/MacOS/NanoKVM
mkdir -p NanoKVM.app/Contents/Resources
cp Info.plist NanoKVM.app/Contents/Info.plist
cp AppIcon.icns NanoKVM.app/Contents/Resources/AppIcon.icns
echo Done. NanoKVM.app is ready.
echo Double-click NanoKVM.app to run.
