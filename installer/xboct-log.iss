#define AppName "Xboct Log"
#define AppPublisher "xboct-log"
#define AppUrl "https://github.com/Ku6epXBOCTuK/xboct-log"
#define AppExe "xboct-log.cmd"

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#ifndef StageDir
  #define StageDir "..\.dev\package\xboct-log-" + AppVersion + "-win-x64"
#endif

#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

[Setup]
AppId={{7D2C1F4A-58B1-4E2E-9C43-6A0F1D8B7C21}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}/issues
DefaultDirName={localappdata}\Programs\Xboct Log
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=xboct-log-{#AppVersion}-win-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Открыть {#AppName}"; Flags: postinstall nowait skipifsilent shellexec

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
