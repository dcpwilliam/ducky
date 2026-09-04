; Custom installer sections for Ducky
; electron-builder handles file copying, icons, and standard installation

; Add custom Start Menu folder structure
!macro customInstall
  ; Additional Start Menu shortcut with subfolder
  CreateDirectory "$SMPROGRAMS\Ducky"
  CreateShortCut "$SMPROGRAMS\Ducky\Ducky.lnk" "$INSTDIR\Ducky.exe"
  CreateShortCut "$SMPROGRAMS\Ducky\Uninstall Ducky.lnk" "$INSTDIR\Uninstall Ducky.exe"
!macroend

!macro customUnInstall
  ; Clean up Start Menu folder
  RMDir /r "$SMPROGRAMS\Ducky"
!macroend
