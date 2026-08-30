; Write Hearthstone log.config during Setup so the next (or first) HS launch
; already prints Power.log. Keys must match src/core/logConfig.ts.
; options.txt is key=value (not INI); ConfigWrite keeps other graphics keys.
!include "TextFunc.nsh"
!macro customInstall
  SetShellVarContext current
  CreateDirectory "$LOCALAPPDATA\Blizzard\Hearthstone"
  ${ConfigWrite} "$LOCALAPPDATA\Blizzard\Hearthstone\options.txt" "graphicsfullscreen=" "False" $R0
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "Power" "LogLevel" "1"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "Power" "FilePrinting" "true"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "Power" "ConsolePrinting" "false"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "Power" "ScreenPrinting" "false"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "Power" "Verbose" "true"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "LoadingScreen" "LogLevel" "1"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "LoadingScreen" "FilePrinting" "true"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "LoadingScreen" "ConsolePrinting" "false"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "LoadingScreen" "ScreenPrinting" "false"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "LoadingScreen" "Verbose" "false"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "GameNet" "LogLevel" "1"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "GameNet" "FilePrinting" "true"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "GameNet" "ConsolePrinting" "false"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "GameNet" "ScreenPrinting" "false"
  WriteINIStr "$LOCALAPPDATA\Blizzard\Hearthstone\log.config" "GameNet" "Verbose" "false"
!macroend
