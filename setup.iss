; 笔下寸心 Inno Setup 安装脚本
; 编译方式：用 Inno Setup 6 打开此文件，点击 Build > Compile

#define MyAppName "笔下寸心"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "笔下寸心"
#define MyAppExeName "笔下寸心.exe"

[Setup]
AppId={{BIXIACUNXIN-NOVEL-CONTINUATION-2026}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; 安装程序输出
OutputDir=output
OutputBaseFilename=笔下寸心安装程序
; 压缩
Compression=lzma2/ultra64
SolidCompression=yes
; 外观
WizardStyle=modern
SetupIconFile=icon.ico
; 权限
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; 卸载
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
; 默认使用英文（Inno Setup 6.7.1 不自带中文语言文件）

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "开机自动启动"; GroupDescription: "其他选项:"; Flags: unchecked

[Files]
; 主程序
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; 数据目录（首次安装时复制，不覆盖已有数据）
Source: "data\*"; DestDir: "{app}\data"; Flags: ignoreversion skipifsourcedoesntexist onlyifdoesntexist uninsneveruninstall
; 使用说明
Source: "使用说明.txt"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; 开始菜单
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
; 桌面快捷方式
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
; 开机自启
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 卸载时删除日志目录
Type: filesandordirs; Name: "{app}\logs"
; 注意：data 目录保留，用户数据不丢失
