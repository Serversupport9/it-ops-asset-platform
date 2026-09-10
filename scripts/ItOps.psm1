<#
    ItOps.psm1 — IT Operations Asset Platform helper module
    ------------------------------------------------------
    Version-controlled home for the helpers that previously existed ONLY in a
    local PowerShell profile (Run-Sql / Run-SqlVar). That was itself a
    durability gap: the commands every runbook in docs/ references were not in
    the repo. They are now.

    Load:      Import-Module D:\it-ops-automation\scripts\ItOps.psm1 -Force
    Persist:   add that line to $PROFILE

    All commands talk to the containers defined in docker-compose.yml:
      itops_postgres (5432)  itops_n8n (5678)  itops_adminer (8081)

    Credentials are read from .env at run time and never echoed.
#>

$script:RepoRoot = Split-Path -Parent $PSScriptRoot

function Get-ItOpsEnv {
    <#  Parses .env into a hashtable. Handles the UTF-8 BOM that is present in
        this repo's .env and would otherwise corrupt the first key name.  #>
    [CmdletBinding()]
    param([string]$Path = (Join-Path $script:RepoRoot '.env'))

    if (-not (Test-Path $Path)) { throw "No .env found at $Path" }

    $map = @{}
    foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
        $clean = $line -replace "^\uFEFF", ''
        if ($clean -match '^\s*#') { continue }
        if ($clean -notmatch '=')  { continue }
        $k, $v = $clean -split '=', 2
        $map[$k.Trim()] = $v.Trim()
    }
    return $map
}

function Test-ItOpsStack {
    <#  Health check. Run this FIRST in any new session — it is the fastest way
        to tell "the query is wrong" apart from "the stack is down".  #>
    [CmdletBinding()]
    param()

    Write-Host "`n=== containers ===" -ForegroundColor Cyan
    docker ps --filter 'name=itops_' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

    $envMap = Get-ItOpsEnv
    Write-Host "`n=== postgres ===" -ForegroundColor Cyan
    docker exec itops_postgres pg_isready -U $envMap['POSTGRES_USER']

    Write-Host "`n=== itops database ===" -ForegroundColor Cyan
    Invoke-ItOpsSql -Query @"
SELECT current_database() AS db,
       (SELECT count(*) FROM information_schema.tables
         WHERE table_schema='public') AS tables,
       (SELECT count(*) FROM stg_assets_sheet)  AS staged_rows,
       (SELECT max(synced_at) FROM stg_assets_sheet) AS last_sync,
       (SELECT count(*) FROM assets)            AS assets,
       (SELECT count(*) FROM employees)         AS employees;
"@

    Write-Host "`n=== n8n ===" -ForegroundColor Cyan
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:5678/healthz' -TimeoutSec 5 -UseBasicParsing
        Write-Host "n8n healthz: $($r.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "n8n unreachable: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Invoke-ItOpsSql {
    <#  Ad hoc query. Use for verification SELECTs, not for migrations.
        Example: Invoke-ItOpsSql -Query "SELECT count(*) FROM assets;"  #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Query,
        [switch]$Csv
    )
    $envMap = Get-ItOpsEnv
    $fmt = if ($Csv) { @('--csv') } else { @() }

    # Tags every write this session makes with 'claude-code' so the audit_log trigger
    # (db/migration_2026-08-26_audit_log.sql) can attribute it correctly - see the project conventions
    # audit-log rule. Harmless on read-only queries.
    $tagged = "SET app.actor = 'claude-code';`n$Query"

    $tagged | docker exec -i `
        -e PGPASSWORD=$($envMap['POSTGRES_PASSWORD']) `
        itops_postgres psql `
            -U $envMap['POSTGRES_USER'] `
            -d $envMap['POSTGRES_DB'] `
            -v ON_ERROR_STOP=1 @fmt -f -
}

function Invoke-ItOpsSqlFile {
    <#  Runs a .sql file, optionally with psql variables.

        Scripts in db/ default to DRY RUN (they open a transaction and ROLLBACK
        unless do_commit=true is passed), so the no-variable form is the safe one.

        Aliased as Run-Sql and Run-SqlVar, which is how every runbook in docs/
        refers to it:
          Run-Sql    db\migration_2026-08-17_team_party_type.sql
          Run-SqlVar db\migration_2026-08-17_team_party_type.sql "do_commit=true"   # APPLIES
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, Position = 0)][string]$File,
        [Parameter(Position = 1, ValueFromRemainingArguments)][string[]]$Vars
    )

    $path = if ([System.IO.Path]::IsPathRooted($File)) { $File }
            else { Join-Path $script:RepoRoot $File }
    if (-not (Test-Path $path)) { throw "SQL file not found: $path" }

    $envMap = Get-ItOpsEnv

    # do_commit must always be defined - the scripts branch on it with \if and
    # psql ERRORS on an undefined variable rather than defaulting to false.
    $varArgs   = @()
    $hasCommit = $false
    foreach ($v in $Vars) {
        if ($v -match '^\s*do_commit\s*=') { $hasCommit = $true }
        $varArgs += @('-v', $v)
    }
    if (-not $hasCommit) { $varArgs += @('-v', 'do_commit=false') }

    $applying = [bool]($Vars -match 'do_commit\s*=\s*true')
    $mode     = if ($applying) { 'APPLY' } else { 'DRY RUN' }
    $colour   = if ($applying) { 'Red' }   else { 'Green' }
    Write-Host "[$mode] $path" -ForegroundColor $colour

    # See Invoke-ItOpsSql for why every session is tagged 'claude-code' for audit_log.
    $tagged = "SET app.actor = 'claude-code';`n" + (Get-Content -Raw -Path $path)

    $tagged | docker exec -i `
        -e PGPASSWORD=$($envMap['POSTGRES_PASSWORD']) `
        itops_postgres psql `
            -U $envMap['POSTGRES_USER'] `
            -d $envMap['POSTGRES_DB'] `
            -v ON_ERROR_STOP=1 @varArgs -f -
}

# The documented command names. Aliases are exempt from the approved-verb check,
# so this keeps Run-Sql / Run-SqlVar working without the import-time warning.
Set-Alias -Name Run-Sql    -Value Invoke-ItOpsSqlFile
Set-Alias -Name Run-SqlVar -Value Invoke-ItOpsSqlFile

function Export-N8nWorkflows {
    <#  Exports every workflow out of n8n's internal database into the repo.

        This closes the oldest unresolved risk in the project conventions: workflows exist
        ONLY inside the n8n Docker volume, so one lost volume destroys every
        workflow built across all phases.

        Uses the n8n CLI inside the container rather than the public REST API —
        the CLI needs no API key. docker-compose already mounts
        ./n8n-workflows at /data/workflows, so exports land straight in the repo.  #>
    [CmdletBinding()]
    param([switch]$SkipCredentials)

    $stamp = Get-Date -Format 'yyyy-MM-dd'
    Write-Host "Exporting workflows to n8n-workflows\_export-$stamp ..." -ForegroundColor Cyan

    docker exec itops_n8n sh -lc "mkdir -p /data/workflows/_export-$stamp && n8n export:workflow --all --separate --pretty --output=/data/workflows/_export-$stamp"
    if ($LASTEXITCODE -ne 0) { throw "n8n export:workflow failed with exit code $LASTEXITCODE" }

    $dir = Join-Path $script:RepoRoot "n8n-workflows\_export-$stamp"
    $files = Get-ChildItem -Path $dir -Filter '*.json' -ErrorAction SilentlyContinue
    Write-Host "Exported $($files.Count) workflow file(s):" -ForegroundColor Green
    foreach ($f in $files) {
        $name = (Get-Content -Raw $f.FullName | ConvertFrom-Json).name
        Write-Host ("  {0,-28} {1}" -f $f.Name, $name)
    }

    if (-not $SkipCredentials) {
        # Credentials export stays ENCRYPTED and lands in credentials\, which
        # .gitignore already excludes. Never pass --decrypted: with
        # N8N_ENCRYPTION_KEY sitting in .env that would be plaintext secrets.
        Write-Host "`nExporting credentials (encrypted) to credentials\ ..." -ForegroundColor Cyan
        docker exec itops_n8n sh -lc "n8n export:credentials --all --output=/tmp/creds.json"
        docker cp "itops_n8n:/tmp/creds.json" (Join-Path $script:RepoRoot "credentials\n8n-credentials-$stamp.json")
        docker exec itops_n8n sh -lc "rm -f /tmp/creds.json"
        Write-Host "Credentials written (gitignored). Restoring workflows without these is painful." -ForegroundColor Green
    }

    Write-Host "`nNow commit: git add n8n-workflows && git commit -m 'Export n8n workflows $stamp'" -ForegroundColor Yellow
}

function Backup-ItOpsDatabase {
    <#  pg_dump of the itops database into backups\ (gitignored).
        Run before any migration you intend to COMMIT.  #>
    [CmdletBinding()]
    param()
    $envMap = Get-ItOpsEnv
    $stamp  = Get-Date -Format 'yyyy-MM-dd_HHmm'
    $out    = Join-Path $script:RepoRoot "backups\itops-$stamp.sql"

    docker exec -e PGPASSWORD=$($envMap['POSTGRES_PASSWORD']) itops_postgres `
        pg_dump -U $envMap['POSTGRES_USER'] -d $envMap['POSTGRES_DB'] |
        Set-Content -Path $out -Encoding UTF8

    Write-Host "Backup written: $out ($([math]::Round((Get-Item $out).Length/1MB,2)) MB)" -ForegroundColor Green
}

function Backup-ItOpsDatabaseDaily {
    <#  Scheduled daily backup - distinct from Backup-ItOpsDatabase (that one is the manual,
        uncompressed, pre-migration safety net; keep using that one before COMMITting a
        migration). This one is meant to run unattended via Windows Task Scheduler:
        gzip-compresses the dump, rotates backups older than -RetentionDays, and always writes
        one line to backups\backup_log.txt (success or failure) so there's a record even if
        nobody checks Task Scheduler's own history. Exits non-zero on failure so Task Scheduler
        flags the run as failed.

        One file per calendar day (itops-daily-yyyy-MM-dd.sql.gz) - re-running the same day
        overwrites that day's file rather than accumulating duplicates.  #>
    [CmdletBinding()]
    param([int]$RetentionDays = 30)

    $envMap    = Get-ItOpsEnv
    $backupDir = Join-Path $script:RepoRoot "backups"
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
    $stamp   = Get-Date -Format 'yyyy-MM-dd'
    $sqlPath = Join-Path $backupDir "itops-daily-$stamp.sql"
    $gzPath  = "$sqlPath.gz"
    $logPath = Join-Path $backupDir "backup_log.txt"

    function Write-BackupLog([string]$Line) {
        Add-Content -Path $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Line"
    }

    try {
        docker exec -e PGPASSWORD=$($envMap['POSTGRES_PASSWORD']) itops_postgres `
            pg_dump -U $envMap['POSTGRES_USER'] -d $envMap['POSTGRES_DB'] |
            Set-Content -Path $sqlPath -Encoding UTF8

        if (-not (Test-Path $sqlPath) -or (Get-Item $sqlPath).Length -eq 0) {
            throw "pg_dump produced an empty or missing file - check 'docker exec itops_postgres pg_isready' and that the container is up"
        }

        $inBytes   = [System.IO.File]::ReadAllBytes($sqlPath)
        $outStream = [System.IO.File]::Create($gzPath)
        $gzStream  = New-Object System.IO.Compression.GZipStream($outStream, [System.IO.Compression.CompressionMode]::Compress)
        $gzStream.Write($inBytes, 0, $inBytes.Length)
        $gzStream.Close()
        $outStream.Close()
        Remove-Item $sqlPath -Force

        $sizeMB = [math]::Round((Get-Item $gzPath).Length / 1MB, 2)
        Write-BackupLog "OK      $gzPath  ($sizeMB MB)"
        Write-Host "Daily backup written: $gzPath ($sizeMB MB)" -ForegroundColor Green
    }
    catch {
        Write-BackupLog "FAILED  $($_.Exception.Message)"
        Write-Error "Daily backup failed: $($_.Exception.Message)"
        exit 1
    }

    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $backupDir -Filter "itops-daily-*.sql.gz" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            Remove-Item $_.FullName -Force
            Write-BackupLog "ROTATE  deleted $($_.Name) (older than $RetentionDays days)"
        }
}

Export-ModuleMember -Function Get-ItOpsEnv, Test-ItOpsStack, Invoke-ItOpsSql,
                              Invoke-ItOpsSqlFile, Export-N8nWorkflows, Backup-ItOpsDatabase,
                              Backup-ItOpsDatabaseDaily `
                    -Alias    Run-Sql, Run-SqlVar
