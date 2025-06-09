#!/usr/bin/env bun
// daily-logger
// log daily progress

import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

const IGNORE_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'deno.lock'
];

interface CliOptions {
  output?: string;
  log?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): { command: string; options: CliOptions } {
  const command = args[2] || 'help';
  const options: CliOptions = {};
  
  for (let i = 3; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '-l' || arg === '--log') {
      options.log = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    }
  }
  
  return { command, options };
}

function showHelp(): void {
  console.log(`
daily-logger v1.0.0
Generate daily progress logs from git commits and diffs

Usage:
  daily-logger <command> [options]

Commands:
  today      Generate log for today's commits
  unpushed   Generate log for unpushed commits  
  both       Generate log for both today's and unpushed commits
  help       Show this help message

Options:
  -o, --output <file>   Output file (default: prompt.txt)
  -l, --log             Log to console instead of file
  -h, --help            Show help message

Examples:
  daily-logger today
  daily-logger unpushed -o summary.txt
  daily-logger both --log
`);
}

async function checkGitRepo(): Promise<boolean> {
  try {
    execSync('git status', { stdio: 'ignore' });
    return true;
  } catch {
    console.error('❌ Not in a git repository. This tool only works in git repositories.');
    process.exit(1);
  }
}

async function getTodayCommits(): Promise<string[]> {
  try {
    const output = execSync(`git log --since="midnight" --pretty=format:"%h - %s (%an)"`, 
      { encoding: 'utf8' });
    return output.trim() ? output.trim().split('\n') : [];
  } catch {
    return [];
  }
}

async function getUnpushedCommits(): Promise<string[]> {
  try {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (!currentBranch) return [];
    
    const output = execSync(`git log origin/${currentBranch}..HEAD --pretty=format:"%h - %s (%an)"`, 
      { encoding: 'utf8' });
    return output.trim() ? output.trim().split('\n') : [];
  } catch {
    return [];
  }
}

async function getDiffFromMain(): Promise<string> {
  try {
    const diff = execSync('git diff main', { encoding: 'utf8' });
    
    const lines = diff.split('\n');
    const filteredLines: string[] = [];
    let skipFile = false;
    
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const fileName = line.split(' ').pop()?.replace('b/', '');
        skipFile = IGNORE_FILES.some(ignoreFile => fileName?.includes(ignoreFile));
      }
      
      if (!skipFile) {
        filteredLines.push(line);
      }
    }
    
    return filteredLines.join('\n');
  } catch (error) {
    console.warn('⚠️  Could not get diff from main branch, using working directory diff instead');
    try {
      return execSync('git diff', { encoding: 'utf8' });
    } catch {
      return 'No changes found';
    }
  }
}

function generatePrompt(commits: string[], diff: string, type: 'today' | 'unpushed'): string {
  const commitType = type === 'today' ? 'today' : 'unpushed';
  
  return `# Daily Progress Summary

## Commits (${commitType})
${commits.length > 0 ? commits.map(commit => `- ${commit}`).join('\n') : 'No commits found'}

## Code Changes
\`\`\`diff
${diff || 'No changes found'}
\`\`\`

## Instructions
List only what applies:

**Features:**
- [new features added]

**Refactors:**
- [code improvements/restructuring]

**Issues Resolved:**
- [bugs fixed/issues closed]

**Other:**
- [anything else noteworthy]

One line per item. Skip sections if nothing applies.`;
}

async function handleOutput(prompt: string, options: CliOptions): Promise<void> {
  if (options.log) {
    console.log(prompt);
  } else {
    const outputFile = options.output || 'prompt.txt';
    writeFileSync(outputFile, prompt);
    console.log(`✅ Prompt written to ${outputFile}`);
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  
  if (options.help || command === 'help') {
    showHelp();
    return;
  }
  
  await checkGitRepo();
  
  switch (command) {
    case 'today': {
      const commits = await getTodayCommits();
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(commits, diff, 'today');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'unpushed': {
      const commits = await getUnpushedCommits();
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(commits, diff, 'unpushed');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'both': {
      const todayCommits = await getTodayCommits();
      const unpushedCommits = await getUnpushedCommits();
      const allCommits = [...new Set([...todayCommits, ...unpushedCommits])];
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(allCommits, diff, 'today');
      await handleOutput(prompt, options);
      break;
    }
    
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "daily-logger help" for usage information.');
      process.exit(1);
  }
}

main().catch(console.error);
