# gitday

A CLI tool that uses AI to generate intelligent daily progress summaries from your git commits and diffs. Perfect for creating polished summaries for daily standups, progress reports, or personal tracking.

## Features

- 🤖 **AI-Powered Summaries** - Uses Google's Gemini AI to generate intelligent progress reports
- 📊 Generate logs from today's commits
- 🚀 Analyze unpushed commits  
- 🔄 Combine both today's and unpushed work
- 📄 Output to file or console
- 🎯 Smart diff filtering (ignores lock files)
- 🛡️ Git repository validation
- 🔑 Secure API key management

## Installation

```bash
bun install -g gitday
```

## Setup

Before using gitday, you'll need a Google Gemini API key:

1. Get your API key from: https://aistudio.google.com/apikey
2. Set it up using one of these methods:
   - Environment variable: `export GEMINI_API_KEY=your_api_key`
   - Run `gitday config set` to save it to config file
   - The tool will prompt you on first use

## Usage

### Commands

```bash
# Generate AI summary for today's commits
gitday today

# Generate AI summary for unpushed commits
gitday unpushed

# Generate AI summary for both today's and unpushed commits
gitday both

# Manage API key configuration
gitday config show|set|delete

# Show help
gitday help
```

### Options

```bash
-o, --output <file>   Output file (default: prompt.txt)
-l, --log             Log to console instead of file
-h, --help            Show help message
```

### Examples

```bash
# Save today's AI-generated summary to default file (prompt.txt)
gitday today

# Save unpushed work summary to a specific file
gitday unpushed -o weekly-summary.txt

# View combined progress summary in console
gitday both --log

# Output today's work summary to console
gitday today -l

# Check API key status
gitday config show

# Update API key
gitday config set
```

## Output Format

gitday generates AI-powered summaries organized into:

- **Features:** New features added
- **Refactors:** Code improvements/restructuring  
- **Issues Resolved:** Bugs fixed/issues closed
- **Other:** Anything else noteworthy

The AI analyzes your commits and code diffs to create concise, professional summaries perfect for sharing with your team.

## Requirements

- Must be run inside a git repository
- Requires `bun` runtime
- Git must be available in PATH
- **Google Gemini API key** (free tier available)

## How It Works

gitday analyzes your git history and generates AI summaries by:

1. Fetching commits from specified timeframes
2. Getting code diffs (compared to main branch)
3. Filtering out noise (lock files, etc.)
4. Creating a structured prompt with your changes
5. **Using Google's Gemini AI to generate intelligent summaries**

Perfect for creating professional progress reports that you can share in meetings or with stakeholders!

## API Key Management

```bash
# Check if API key is configured
gitday config show

# Set or update API key
gitday config set  

# Remove saved API key
gitday config delete
```

API keys are securely stored in `~/.gitday-config.json` or can be set via the `GEMINI_API_KEY` environment variable.

## License

MIT © rudro
