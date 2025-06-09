# gitday

A CLI tool to generate daily progress logs from git commits and diffs. Perfect for creating summaries of your development work for daily standups, progress reports, or personal tracking.

## Features

- 📊 Generate logs from today's commits
- 🚀 Analyze unpushed commits  
- 🔄 Combine both today's and unpushed work
- 📄 Output to file or console
- 🎯 Smart diff filtering (ignores lock files)
- 🛡️ Git repository validation

## Installation

```bash
bun install -g gitday
```

## Usage

### Commands

```bash
# Generate log for today's commits
gitday today

# Generate log for unpushed commits
gitday unpushed

# Generate log for both today's and unpushed commits
gitday both

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
# Save today's progress to default file (prompt.txt)
gitday today

# Save unpushed work to a specific file
gitday unpushed -o weekly-summary.txt

# View combined progress in console
gitday both --log

# Output today's work to console
gitday today -l
```

## Output Format

gitday generates a structured prompt that includes:

1. **Overview** - Brief description of what was accomplished
2. **Key Changes** - Major features, fixes, or improvements made  
3. **Technical Details** - Important technical decisions or implementations
4. **Files Modified** - Summary of which areas of the codebase were touched
5. **Impact** - How these changes affect the project

## Requirements

- Must be run inside a git repository
- Requires `bun` runtime
- Git must be available in PATH

## How It Works

gitday analyzes your git history and generates summaries by:

- Fetching commits from specified timeframes
- Getting code diffs (compared to main branch)
- Filtering out noise (lock files, etc.)
- Formatting everything into a structured summary

Perfect for feeding into LLMs or using as meeting notes!

## License

MIT © rudro
