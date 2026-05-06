# LogMeIn ETL - Developer Tools Setup Script (PowerShell)
# Installs and configures ESLint, Prettier, Jest, Nodemon, etc. for Windows

param(
    [switch]$SkipNodeCheck = $false,
    [switch]$SkipInstall = $false
)

Write-Host "LogMeIn ETL - Developer Tools Setup (PowerShell)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ========== FUNCTIONS ==========

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Test-CommandExists {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Create-DirectoryIfNotExists {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
        Write-Success "Created directory: $Path"
    }
    else {
        Write-Info "$Path already exists"
    }
}

function Create-FileIfNotExists {
    param([string]$Path, [string]$Content)
    if (-not (Test-Path $Path)) {
        Set-Content -Path $Path -Value $Content -Encoding UTF8
        Write-Success "Created: $(Split-Path -Leaf $Path)"
    }
    else {
        Write-Info "$(Split-Path -Leaf $Path) already exists"
    }
}

# ========== CHECK PREREQUISITES ==========

Write-Host ""
Write-Host "Checking prerequisites..." -ForegroundColor Cyan

if (-not $SkipNodeCheck) {
    if (-not (Test-CommandExists "node")) {
        Write-Host "[ERROR] Node.js is not installed. Please install from https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
    Write-Success "Node.js is installed: $(node --version)"

    if (-not (Test-CommandExists "npm")) {
        Write-Host "[ERROR] npm is not installed." -ForegroundColor Red
        exit 1
    }
    Write-Success "npm is installed: $(npm --version)"
}

# ========== CREATE DIRECTORIES ==========

Write-Host ""
Write-Host "Creating directories..." -ForegroundColor Cyan

Create-DirectoryIfNotExists ".vscode"
Create-DirectoryIfNotExists "logs"
Create-DirectoryIfNotExists "exports"
Create-DirectoryIfNotExists "backups"
Create-DirectoryIfNotExists ".cache"

# ========== INSTALL DEPENDENCIES ==========

if (-not $SkipInstall) {
    Write-Host ""
    Write-Host "Installing development dependencies..." -ForegroundColor Cyan
    
    $dependencies = @(
        "nodemon",
        "eslint",
        "prettier",
        "eslint-config-prettier",
        "eslint-plugin-prettier",
        "jest",
        "npm-check-updates",
        "npm-check",
        "dotenv-cli",
        "clinic",
        "npm-run-all",
        "concurrently",
        "jsdoc",
        "csv-parse"
    )

    Write-Host "Installing: $($dependencies -join ', ')" -ForegroundColor Gray
    npm install --save-dev $dependencies

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Dependencies installed successfully"
    }
    else {
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# ========== CREATE CONFIG FILES ==========

Write-Host ""
Write-Host "Creating configuration files..." -ForegroundColor Cyan

# .eslintrc.json
$eslintConfig = @'
{
  "env": {
    "node": true,
    "es2021": true,
    "jest": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:prettier/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": "latest"
  },
  "rules": {
    "no-unused-vars": ["warn"],
    "no-console": "off",
    "semi": ["error", "always"],
    "quotes": ["error", "single"],
    "comma-dangle": ["error", "always-multiline"]
  }
}
'@

Create-FileIfNotExists ".eslintrc.json" $eslintConfig

# .prettierrc.json
$prettierConfig = @'
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
'@

Create-FileIfNotExists ".prettierrc.json" $prettierConfig

# .prettierignore
$prettierIgnore = @'
node_modules
.cache
*.db
*.log
dist
coverage
exports
backups
'@

Create-FileIfNotExists ".prettierignore" $prettierIgnore

# nodemon.json
$nodemonConfig = @'
{
  "watch": ["*.js", "src/"],
  "ignore": ["node_modules", ".cache", "*.db", "logs/", "exports/", "backups/"],
  "delay": 500,
  "ext": "js,json",
  "exec": "node",
  "env": {
    "NODE_ENV": "development"
  }
}
'@

Create-FileIfNotExists "nodemon.json" $nodemonConfig

# jest.config.js
$jestConfig = @'
module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    '*.js',
    '!node_modules/**',
    '!coverage/**'
  ]
};
'@

Create-FileIfNotExists "jest.config.js" $jestConfig

# .gitignore
$gitignore = @'
# Dependencies
node_modules/
package-lock.json
yarn.lock

# Environment
.env
.env.local
.env.*.local

# Database
*.db
*.db-journal

# Logs
logs/
*.log
npm-debug.log*

# Cache
.cache/
coverage/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Build
dist/
build/

# Data
exports/
backups/
'@

Create-FileIfNotExists ".gitignore" $gitignore

# ========== CREATE VS CODE CONFIG ==========

Write-Host ""
Write-Host "Creating VS Code configuration..." -ForegroundColor Cyan

# .vscode/launch.json
$launchConfig = @'
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch ETL (Basic)",
      "program": "${workspaceFolder}/examples.js",
      "args": ["basic"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Launch ETL (Analyze)",
      "program": "${workspaceFolder}/examples.js",
      "args": ["analyze"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Launch ETL (Robust)",
      "program": "${workspaceFolder}/examples.js",
      "args": ["robust"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Running Process",
      "port": 9229,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
'@

Create-FileIfNotExists ".vscode/launch.json" $launchConfig

# .vscode/settings.json
$vscodeSettings = @'
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript"
  ],
  "[javascript]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "files.exclude": {
    "**/.cache": true,
    "**/node_modules": true
  }
}
'@

Create-FileIfNotExists ".vscode/settings.json" $vscodeSettings

# ========== UPDATE PACKAGE.JSON ==========

Write-Host ""
Write-Host "Updating package.json scripts..." -ForegroundColor Cyan

$packageJsonPath = "package.json"

if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    
    # Ensure scripts object exists
    if (-not $packageJson.scripts) {
        $packageJson | Add-Member -NotePropertyName "scripts" -NotePropertyValue @{} -Force
    }
    
    # Add/update scripts
    $newScripts = @{
        "dev" = "nodemon examples.js basic"
        "dev:analyze" = "nodemon examples.js analyze"
        "dev:robust" = "nodemon examples.js robust"
        "lint" = "eslint ."
        "lint:fix" = "eslint . --fix"
        "format" = "prettier --write ."
        "format:check" = "prettier --check ."
        "test" = "jest"
        "test:watch" = "jest --watch"
        "test:coverage" = "jest --coverage"
        "check-updates" = "ncu"
        "update-deps" = "ncu -u & npm install"
        "debug" = "node --inspect-brk examples.js basic"
        "profile" = "clinic doctor -- node examples.js basic"
        "profile:flame" = "clinic flame -- node examples.js basic"
        "clean" = "Remove-Item -Recurse -Force node_modules, .cache -ErrorAction SilentlyContinue"
        "clean:hard" = "Remove-Item -Recurse -Force node_modules, .cache, exports, backups -ErrorAction SilentlyContinue"
        "pre-commit" = "npm-run-all lint test"
        "build" = "npm-run-all lint test format"
        "docs" = "jsdoc logmein-etl.js utils.js -d ./docs"
        "import:sample" = "node import-data.js sample"
        "import:templates" = "node import-data.js templates"
        "export:csv" = "node examples.js csv"
        "export:spreadsheet" = "node examples.js spreadsheet"
    }
    
    # Merge scripts
    foreach ($script in $newScripts.GetEnumerator()) {
        $packageJson.scripts | Add-Member -NotePropertyName $script.Key -NotePropertyValue $script.Value -Force
    }
    
    # Write back
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath -Encoding UTF8
    Write-Success "Scripts updated in package.json"
}
else {
    Write-Warning "package.json not found - skipping script updates"
}

# ========== RUN INITIAL CHECKS ==========

Write-Host ""
Write-Host "Running initial code quality checks..." -ForegroundColor Cyan

try {
    Write-Host "Running lint fixes..." -ForegroundColor Gray
    npm run lint:fix 2>$null | Out-Null
    Write-Success "Lint fixes completed"
}
catch {
    Write-Warning "Lint had some warnings (this is OK)"
}

try {
    Write-Host "Running format..." -ForegroundColor Gray
    npm run format 2>$null | Out-Null
    Write-Success "Format completed"
}
catch {
    Write-Warning "Format had some issues (this is OK)"
}

# ========== SUMMARY ==========

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Success "Setup Complete!"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Available Commands:" -ForegroundColor Cyan
Write-Host ""

Write-Host "Development:" -ForegroundColor Yellow
Write-Host "  npm run dev            - Start with auto-reload"
Write-Host "  npm run dev:analyze    - Start analyze example with auto-reload"
Write-Host "  npm run debug          - Debug with breakpoints in VS Code"
Write-Host ""

Write-Host "Code Quality:" -ForegroundColor Yellow
Write-Host "  npm run lint           - Check code quality"
Write-Host "  npm run lint:fix       - Auto-fix linting issues"
Write-Host "  npm run format         - Format code with Prettier"
Write-Host ""

Write-Host "Testing:" -ForegroundColor Yellow
Write-Host "  npm test               - Run tests once"
Write-Host "  npm run test:watch     - Re-run tests on file change"
Write-Host "  npm run test:coverage  - Generate coverage report"
Write-Host ""

Write-Host "Data Import/Export:" -ForegroundColor Yellow
Write-Host "  npm run import:sample      - Generate sample data"
Write-Host "  npm run import:templates   - Create CSV templates"
Write-Host "  npm run export:csv         - Export to CSV"
Write-Host "  npm run export:spreadsheet - Export formatted spreadsheets"
Write-Host ""

Write-Host "Maintenance:" -ForegroundColor Yellow
Write-Host "  npm run check-updates  - Check for dependency updates"
Write-Host "  npm run update-deps    - Update all dependencies"
Write-Host "  npm run clean          - Remove logs and cache"
Write-Host ""

Write-Host "Performance:" -ForegroundColor Yellow
Write-Host "  npm run profile        - Generate performance report (clinic.js)"
Write-Host "  npm run profile:flame  - Generate flame graph"
Write-Host ""

Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  npm run docs           - Generate JSDoc documentation"
Write-Host ""

Write-Host "Configuration Files Created:" -ForegroundColor Cyan
Write-Host "  * .eslintrc.json       (Code linting)"
Write-Host "  * .prettierrc.json     (Code formatting)"
Write-Host "  * nodemon.json         (Auto-reload)"
Write-Host "  * jest.config.js       (Testing)"
Write-Host "  * .vscode/launch.json  (VS Code debugging)"
Write-Host "  * .vscode/settings.json (VS Code settings)"
Write-Host "  * .gitignore           (Git exclusions)"
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. npm run import:sample    (Generate sample data)"
Write-Host "  2. npm run dev              (Start development)"
Write-Host "  3. Press F5 in VS Code to start debugging"
Write-Host ""

Write-Host "Pro Tips:" -ForegroundColor Cyan
Write-Host "  - Install Prettier extension in VS Code for auto-format on save"
Write-Host "  - Use npm run dev for auto-reload development"
Write-Host "  - Check NODE_TOOLS_GUIDE.md for detailed tool documentation"
Write-Host ""

Write-Success "Setup complete! You are ready to start developing."
Write-Host ""
