# Web UI server: serves the React app (web\dist) and a small JSON API over the core functions on
# http://localhost:<port>/. Dot-sourced by switch-github.ps1 -Ui after switch-github-core.ps1.
# One request at a time on this thread, so two actions can never run at once.

$uiPort = 47821
$uiRoot = Join-Path $PSScriptRoot 'web\dist'
$uiWindowTitle = 'Account Switcher server - keep open, Ctrl+C to stop'
# A newer -Ui sets this event; the running server sees it between requests and hands over the port.
$uiStopEventName = 'Local\GitHubAccountSwitcherUi-Stop'
# Long enough for a running switch to finish (two apps closing at up to 20 s each).
$uiTakeoverSeconds = 90
$uiTypes = @{
    '.html'  = 'text/html; charset=utf-8'
    '.js'    = 'text/javascript; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.svg'   = 'image/svg+xml'
    '.png'   = 'image/png'
    '.ico'   = 'image/x-icon'
    '.json'  = 'application/json; charset=utf-8'
    '.woff2' = 'font/woff2'
}

function New-UiToken {
    $bytes = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

# Runs $Action and returns everything it wrote (Write-Host, warnings, native output, errors) as log lines.
function Invoke-UiAction([scriptblock]$Action) {
    $log = New-Object Collections.Generic.List[object]
    $ok = $true
    try {
        & $Action *>&1 | ForEach-Object {
            if ($_ -is [Management.Automation.WarningRecord]) {
                $log.Add([ordered]@{ level = 'warn'; text = $_.Message })
            } elseif ($_ -is [Management.Automation.ErrorRecord]) {
                # gh and git write their normal progress to stderr; PowerShell wraps it as NativeCommandError.
                $level = if ($_.FullyQualifiedErrorId -like 'NativeCommandError*') { 'info' } else { 'error' }
                $log.Add([ordered]@{ level = $level; text = $_.Exception.Message })
            } elseif ("$_".Trim()) {
                $log.Add([ordered]@{ level = 'info'; text = "$_" })
            }
        }
    } catch {
        $ok = $false
        $log.Add([ordered]@{ level = 'error'; text = $_.Exception.Message })
    }
    # ToArray, not @($log): PowerShell 5.1's ConvertTo-Json fails on a wrapped List ("Argument types do not match").
    [ordered]@{ ok = $ok; log = $log.ToArray() }
}

function Start-ToolSignIn($tool, $user) {
    switch ($tool) {
        'gh' {
            Start-Process gh -ArgumentList 'auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https', '--clipboard'
            Write-Host 'GitHub CLI: a console window opened and the one-time code is on the clipboard. Paste it in the browser.'
            Write-Host 'If it asks "Authenticate Git with your GitHub credentials?", answer n (git uses Git Credential Manager).'
        }
        'git' {
            if ($user -notmatch $loginPattern) { throw 'Enter a valid GitHub login first.' }
            Start-Process git -ArgumentList 'credential-manager', 'github', 'login', '--username', $user, '--browser'
            Write-Host "Git Credential Manager is opening the browser to sign in '$user'."
        }
        'desktop' {
            if (-not (Get-Process GitHubDesktop -ErrorAction SilentlyContinue)) {
                if (-not (Test-Path $desktopExe)) { throw "GitHub Desktop not found at $desktopExe" }
                Start-Process $desktopExe
            }
            Write-Host 'GitHub Desktop is open: click "Sign in to GitHub.com".'
        }
        'vscode' {
            if (-not $vscodeExe) { throw 'VS Code not found (no "code" on PATH).' }
            # --reuse-window: a running VS Code gets the request in its last window instead of opening a new one.
            Start-Process $vscodeExe -ArgumentList '--reuse-window'
            Write-Host 'VS Code: click the Accounts icon at the bottom of the left bar, sign in with GitHub, then approve in the browser.'
        }
        default { throw "Unknown tool '$tool'." }
    }
}

function Send-UiResponse($context, [int]$status, [byte[]]$bytes, $type) {
    $response = $context.Response
    $response.StatusCode = $status
    $response.ContentType = $type
    $response.Headers['Cache-Control'] = 'no-store'
    $response.Headers['X-Content-Type-Options'] = 'nosniff'
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

function Send-UiJson($context, $object, [int]$status = 200) {
    $json = ConvertTo-Json -InputObject $object -Depth 6 -Compress
    Send-UiResponse $context $status ([Text.Encoding]::UTF8.GetBytes($json)) 'application/json; charset=utf-8'
}

function Read-UiBody($request) {
    $reader = New-Object IO.StreamReader($request.InputStream, [Text.Encoding]::UTF8)
    try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($text.Trim()) { $text | ConvertFrom-Json } else { [pscustomobject]@{} }
}

function Send-UiFile($context, $urlPath) {
    $root = [IO.Path]::GetFullPath($uiRoot)
    $index = Join-Path $root 'index.html'
    $relative = [Uri]::UnescapeDataString($urlPath).TrimStart('/') -replace '/', '\'
    $file = if ($relative) { [IO.Path]::GetFullPath((Join-Path $root $relative)) } else { $index }
    # Unknown paths get the app; anything that resolves outside web\dist is never served.
    if (-not $file.StartsWith($root + '\', 'OrdinalIgnoreCase') -or -not (Test-Path $file -PathType Leaf)) { $file = $index }
    if (-not (Test-Path $file -PathType Leaf)) {
        $text = 'The web UI is not built yet. Run once: cd web; npm install; npm run build'
        Send-UiResponse $context 404 ([Text.Encoding]::UTF8.GetBytes($text)) 'text/plain; charset=utf-8'
        return
    }
    $type = $uiTypes[[IO.Path]::GetExtension($file).ToLowerInvariant()]
    if (-not $type) { $type = 'application/octet-stream' }
    Send-UiResponse $context 200 ([IO.File]::ReadAllBytes($file)) $type
}

function Invoke-UiApi($context) {
    $request = $context.Request
    $route = "$($request.HttpMethod) $($request.Url.AbsolutePath)"
    if ($request.HttpMethod -eq 'POST') { Write-Host "$(Get-Date -Format 'HH:mm:ss') $route" }
    # Profiles saved from the CLI since the last request; everything else every route reads live anyway.
    Read-AccountProfiles
    switch ($route) {
        'GET /api/status' {
            Send-UiJson $context (Get-SwitcherStatus)
        }
        'GET /api/login-state' {
            $user = "$($request.QueryString['user'])".Trim()
            if ($user -notmatch $loginPattern) { Send-UiJson $context @{ error = 'A valid GitHub login is required.' } 400; return }
            Send-UiJson $context (Get-LoginState $user)
        }
        'POST /api/prepare' {
            Send-UiJson $context (Invoke-UiAction {
                $active = Get-ActiveProfile
                Invoke-WithAppsClosed {
                    if ($active -and $names -contains $active) { Save-ProfileState $active }
                    Clear-AppState
                }
            })
        }
        'POST /api/signin' {
            $body = Read-UiBody $request
            Send-UiJson $context (Invoke-UiAction { Start-ToolSignIn "$($body.tool)" "$($body.user)".Trim() })
        }
        'POST /api/save' {
            $body = Read-UiBody $request
            Send-UiJson $context (Invoke-UiAction {
                $profileName = "$($body.profile)".Trim()
                Set-AccountProfile $profileName "$($body.gitName)".Trim() "$($body.email)".Trim() "$($body.user)".Trim()
                Invoke-WithAppsClosed { Save-ProfileState $profileName }
            })
        }
        'POST /api/delete' {
            $body = Read-UiBody $request
            # signOut: the delete dialog's opt-in "also sign out of GitHub CLI and Git"; missing = false.
            Send-UiJson $context (Invoke-UiAction { Remove-AccountProfile "$($body.profile)" -SignOut:($body.signOut -eq $true) })
        }
        'POST /api/switch' {
            $body = Read-UiBody $request
            Send-UiJson $context (Invoke-UiAction { Switch-Profile "$($body.profile)" })
        }
        default {
            Send-UiJson $context @{ error = "Unknown API route: $route" } 404
        }
    }
}

function Invoke-UiRequest($context, $token) {
    $request = $context.Request
    if ($request.Url.AbsolutePath.StartsWith('/api/')) {
        # Other web pages open in the browser cannot read this run's token, so they cannot drive the API.
        # (Requests for any host but localhost never get here: HttpListener rejects them with 400.)
        if ($request.Headers['X-Switcher-Token'] -ne $token) {
            Send-UiJson $context @{ error = 'Missing or wrong token. Open the link printed in the console.' } 401
            return
        }
        Invoke-UiApi $context
        return
    }
    Send-UiFile $context $request.Url.AbsolutePath
}

# Starts listening. If another switcher UI holds the port, signals it to stop - it finishes any
# running action first - and keeps retrying for up to $uiTakeoverSeconds.
function Open-UiListener($stopEvent) {
    $deadline = (Get-Date).AddSeconds($uiTakeoverSeconds)
    $asked = $false
    while ($true) {
        $listener = New-Object Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$uiPort/")
        try { $listener.Start(); return $listener } catch { $listener.Close() }
        if (-not $asked) {
            Write-Host 'Another switcher UI is running. Asking it to stop (it finishes any running action first)...'
            $null = $stopEvent.Set()
            $asked = $true
        }
        if ((Get-Date) -gt $deadline) {
            throw "Port $uiPort is still in use. Close the other switcher window (title '$uiWindowTitle', or an older 'Windows PowerShell' one) with Ctrl+C, then run this again."
        }
        Start-Sleep -Milliseconds 500
    }
}

function Start-UiServer {
    # Prepare / Save / Switch close VS Code, which ends every process in its terminals - this server
    # included, mid-action. Started from there, reopen in a PowerShell window of its own instead.
    if ($env:TERM_PROGRAM -eq 'vscode') {
        $cli = Join-Path $PSScriptRoot 'switch-github.ps1'
        $saved = $env:TERM_PROGRAM
        $env:TERM_PROGRAM = $null
        try { Start-Process powershell.exe -ArgumentList '-NoProfile', '-NoExit', '-File', "`"$cli`"", '-Ui' } finally { $env:TERM_PROGRAM = $saved }
        Write-Host 'The UI server opened in its own PowerShell window, because closing VS Code during a switch would stop it here.'
        Write-Host 'Keep that window open while you use the UI. This terminal is free.'
        return
    }

    $token = New-UiToken
    $stopEvent = New-Object Threading.EventWaitHandle($false, [Threading.EventResetMode]::ManualReset, $uiStopEventName)
    try {
        $listener = Open-UiListener $stopEvent
    } catch {
        $stopEvent.Dispose()
        throw
    }
    $null = $stopEvent.Reset()
    # A server reopened from VS Code's terminal runs in a plain "Windows PowerShell" window; name it so it can be found.
    try { $Host.UI.RawUI.WindowTitle = $uiWindowTitle } catch { }

    $url = "http://localhost:$uiPort/?t=$token"
    if (Test-Path (Join-Path $uiRoot 'index.html')) {
        Write-Host "Account switcher UI: $url"
        Start-Process $url
    } else {
        Write-Host 'The web UI is not built yet. Run once: cd web; npm install; npm run build'
        Write-Host "Development: cd web; npm run dev, then open http://localhost:5173/?t=$token"
    }
    Write-Host 'Keep this window open while you use the UI. Press Ctrl+C to stop.'

    try {
        while ($listener.IsListening) {
            $pending = $listener.BeginGetContext($null, $null)
            # Wait in short slices so Ctrl+C can stop the loop between them. Index 1 = a newer start asked
            # this server to hand over the port; it is only checked here, between requests.
            $handles = [Threading.WaitHandle[]]@($pending.AsyncWaitHandle, $stopEvent)
            do { $signal = [Threading.WaitHandle]::WaitAny($handles, 500) } while ($signal -eq [Threading.WaitHandle]::WaitTimeout)
            if ($signal -eq 1) {
                Write-Host 'A newer switcher UI was started, so this one stopped. You can close this window.'
                break
            }
            $context = $listener.EndGetContext($pending)
            try {
                Invoke-UiRequest $context $token
            } catch {
                Write-Warning $_.Exception.Message
                try { Send-UiJson $context @{ error = $_.Exception.Message } 500 } catch { }
            }
        }
    } finally {
        $listener.Close()
        $stopEvent.Dispose()
    }
}
