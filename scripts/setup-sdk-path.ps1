# scripts/setup-sdk-path.ps1

# 1. OSの環境変数から動的にSDKのパスを構築し、スラッシュに正規化
$sdkPath = "$env:LOCALAPPDATA\Android\Sdk".Replace('\', '/')

# 2. パスの物理的な存在確認（防御的プログラミング）
if (Test-Path $sdkPath) {
    Write-Host "SDK path found: $sdkPath" -ForegroundColor Green
    
    # 3. BOMを排除した純粋なASCIIフォーマットで設定ファイルを生成
    $targetFile = "android\local.properties"
    $content = "sdk.dir=$sdkPath"
    Set-Content -Path $targetFile -Value $content -Encoding ASCII
    
    Write-Host "Successfully created $targetFile with ASCII encoding." -ForegroundColor Green
} else {
    Write-Host "Error: Android SDK not found at $sdkPath" -ForegroundColor Red
    exit 1
}