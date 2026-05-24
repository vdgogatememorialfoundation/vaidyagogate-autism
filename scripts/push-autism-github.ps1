# Push Autism portal to GitHub (never commits .env)
# Usage:
#   .\scripts\push-autism-github.ps1 -CreateRepo
#   .\scripts\push-autism-github.ps1 -RepoName "vaidyagogate-autism" -GitHubUser "vdgogatememorialfoundation"

param(
    [string]$RepoName = "vaidyagogate-autism",
    [string]$GitHubUser = "vdgogatememorialfoundation",
    [switch]$CreateRepo
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (Test-Path ".env") {
    git ls-files --error-unmatch .env 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "ERROR: .env is tracked. Run: git rm --cached .env" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path ".git")) {
    git init
    git branch -M main
}

git add -A
$pending = git diff --cached --name-only
if ($pending) {
    git commit -m "Add autism awareness portal (separate from doctor seminar system)." -m "Neon PostgreSQL, applicant/admin/scanner, pre-registration, competitions, no fees."
} else {
    Write-Host "Nothing new to commit."
}

if ($CreateRepo) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host "Install GitHub CLI and run: gh auth login" -ForegroundColor Yellow
        exit 1
    }
    gh repo create "$GitHubUser/$RepoName" --private --source . --remote origin --push
    Write-Host "https://github.com/$GitHubUser/$RepoName"
} else {
    $url = "https://github.com/$GitHubUser/$RepoName.git"
    if (-not (git remote get-url origin 2>$null)) {
        git remote add origin $url
    }
    git push -u origin main
    Write-Host "Pushed to $url"
}

Write-Host "Set DATABASE_URL in Vercel/hosting env — do not commit .env" -ForegroundColor Cyan
