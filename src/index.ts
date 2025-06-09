#!/usr/bin/env bun
// daily-logger
// log daily progress

import { Command } from 'commander';
import { simpleGit, SimpleGit } from 'simple-git';
import { writeFileSync } from 'fs';

const program = new Command();
const git: SimpleGit = simpleGit();

const IGNORE_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'deno.lock'
];

async function checkGitRepo(): Promise<boolean> {
  try {
    await git.status();
    return true;
  } catch {
    console.error('❌ Not in a git repository. This tool only works in git repositories.');
    process.exit(1);
  }
}

async function getTodayCommits(): Promise<string[]> {
  const today = new Date().toISOString().split('T')[0];
  const commits = await git.log({
    since: today,
    until: today + ' 23:59:59'
  });
  
  return commits.all.map(commit => 
    `${commit.hash.substring(0, 7)} - ${commit.message} (${commit.author_name})`
  );
}

async function getUnpushedCommits(): Promise<string[]> {
  try {
    const status = await git.status();
    const currentBranch = status.current;
    
    if (!currentBranch) {
      return [];
    }

    const commits = await git.log([`origin/${currentBranch}..HEAD`]);
    
    return commits.all.map(commit => 
      `${commit.hash.substring(0, 7)} - ${commit.message} (${commit.author_name})`
    );
  } catch {
    return [];
  }
}

async function getDiffFromMain(): Promise<string> {
  try {
    const diff = await git.diff(['main', '--no-pager']);
    
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
    return await git.diff(['--no-pager']);
  }
}

function generatePrompt(commits: string[], diff: string, type: 'today' | 'unpushed'): string {
  const commitType = type === 'today' ? 'today' : 'unpushed';
  
  return `# Daily Progress Summary Request

## Task
Generate a comprehensive daily progress summary based on the git commits and code changes provided below.

## Context
This summary is for ${commitType} work in a software development project. Please analyze the commits and code diff to create a meaningful progress report.

## Commits (${commitType})
${commits.length > 0 ? commits.map(commit => `- ${commit}`).join('\n') : 'No commits found'}

## Code Changes
\`\`\`diff
${diff || 'No changes found'}
\`\`\`

## Instructions
Please provide a summary that includes:
1. **Overview**: Brief description of what was accomplished
2. **Key Changes**: Major features, fixes, or improvements made
3. **Technical Details**: Important technical decisions or implementations
4. **Files Modified**: Summary of which areas of the codebase were touched
5. **Impact**: How these changes affect the project

Keep the summary concise but informative, focusing on the business value and technical progress made.`;
}

async function main() {
  program
    .name('daily-logger')
    .description('Generate daily progress logs from git commits and diffs')
    .version('1.0.0');

  program
    .command('today')
    .description('Generate log for today\'s commits')
    .option('-o, --output <file>', 'Output file (default: prompt.txt)')
    .option('-l, --log', 'Log to console instead of file')
    .action(async (options) => {
      await checkGitRepo();
      
      const commits = await getTodayCommits();
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(commits, diff, 'today');
      
      if (options.log) {
        console.log(prompt);
      } else {
        const outputFile = options.output || 'prompt.txt';
        writeFileSync(outputFile, prompt);
        console.log(`✅ Prompt written to ${outputFile}`);
      }
    });

  program
    .command('unpushed')
    .description('Generate log for unpushed commits')
    .option('-o, --output <file>', 'Output file (default: prompt.txt)')
    .option('-l, --log', 'Log to console instead of file')
    .action(async (options) => {
      await checkGitRepo();
      
      const commits = await getUnpushedCommits();
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(commits, diff, 'unpushed');
      
      if (options.log) {
        console.log(prompt);
      } else {
        const outputFile = options.output || 'prompt.txt';
        writeFileSync(outputFile, prompt);
        console.log(`✅ Prompt written to ${outputFile}`);
      }
    });

  program
    .command('both')
    .description('Generate log for both today\'s and unpushed commits')
    .option('-o, --output <file>', 'Output file (default: prompt.txt)')
    .option('-l, --log', 'Log to console instead of file')
    .action(async (options) => {
      await checkGitRepo();
      
      const todayCommits = await getTodayCommits();
      const unpushedCommits = await getUnpushedCommits();
      const allCommits = [...new Set([...todayCommits, ...unpushedCommits])];
      const diff = await getDiffFromMain();
      
      const prompt = generatePrompt(allCommits, diff, 'today');
      
      if (options.log) {
        console.log(prompt);
      } else {
        const outputFile = options.output || 'prompt.txt';
        writeFileSync(outputFile, prompt);
        console.log(`✅ Prompt written to ${outputFile}`);
      }
    });

  await program.parseAsync();
}

main().catch(console.error);
